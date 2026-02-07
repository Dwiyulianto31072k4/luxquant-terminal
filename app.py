import asyncio
import logging
from telethon import TelegramClient, events, functions, types
from telethon.sessions import StringSession
import discord
from discord.ext import commands
import os
from datetime import datetime
import pytz
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Configuration from environment variables
TELEGRAM_API_ID = int(os.getenv("TELEGRAM_API_ID", "0"))
TELEGRAM_API_HASH = os.getenv("TELEGRAM_API_HASH", "")
TELEGRAM_SESSION_STRING = os.getenv("TELEGRAM_SESSION_STRING", "")
DISCORD_TOKEN = os.getenv("DISCORD_TOKEN", "")

FORUM_CHAT_ID = int(os.getenv("FORUM_CHAT_ID", "-1"))
ALLOWED_TOPIC_IDS = {int(x) for x in os.getenv("ALLOWED_TOPIC_IDS", "").split(",") if x.strip()}

# Build TOPIC_TO_DISCORD_CHANNEL from ENV: DISCORD_CH_<topicId>
TOPIC_TO_DISCORD_CHANNEL = {}
for tid in ALLOWED_TOPIC_IDS:
    ch = os.getenv(f"DISCORD_CH_{tid}")
    if ch:
        TOPIC_TO_DISCORD_CHANNEL[tid] = int(ch)

# Role mention configuration
PREMIUM_PLUS_ROLE_NAMES = os.getenv("PREMIUM_PLUS_ROLE_NAMES", "Premium+,premium+").split(",")

# Timezone configuration
JAKARTA_TZ = pytz.timezone('Asia/Jakarta')

# Validation of required environment variables
missing = []
if not TELEGRAM_API_ID: missing.append("TELEGRAM_API_ID")
if not TELEGRAM_API_HASH: missing.append("TELEGRAM_API_HASH")
if not TELEGRAM_SESSION_STRING: missing.append("TELEGRAM_SESSION_STRING")
if not DISCORD_TOKEN: missing.append("DISCORD_TOKEN")
if FORUM_CHAT_ID == -1: missing.append("FORUM_CHAT_ID")
if missing:
    raise SystemExit(f"Missing env vars: {', '.join(missing)}")

class TelegramToDiscordForwarder:
    def __init__(self):
        # Initialize Telegram client with StringSession
        self.tg_client = TelegramClient(
            session=StringSession(TELEGRAM_SESSION_STRING),
            api_id=TELEGRAM_API_ID,
            api_hash=TELEGRAM_API_HASH
        )
        
        # Initialize Discord client with minimal intents
        intents = discord.Intents.none()
        intents.guilds = True
        intents.guild_messages = True
        self.discord_client = discord.Client(intents=intents)
        
        # Forum topics - we now extract topic_id directly from messages
        # No need for top_msg_id mapping anymore
        
        # Setup event handlers
        self.setup_telegram_handlers()
        self.setup_discord_handlers()
    
    def _extract_topic_id(self, msg):
        """
        Extract the forum topic_id directly from message reply_to structure.
        
        In Telegram forum groups, messages have reply_to with:
          - reply_to_top_id: the topic's root message ID (= topic_id for topics)
          - reply_to_msg_id: for replies within a topic, this is the parent message
          - forum_topic: True if this is a forum topic message
        
        For forum topics, the topic_id equals reply_to_top_id or reply_to_msg_id
        when reply_to_top_id is not present (first-level reply in topic).
        
        Topic IDs in Telegram forums are small integers (like 38, 39) that
        correspond to the message ID of the topic's opening message.
        """
        try:
            rt = getattr(msg, "reply_to", None)
            if rt is None:
                # Could be a topic opener message itself
                if getattr(msg, "forum_topic", False):
                    return msg.id
                return None
            
            # Debug: log full reply_to structure
            rt_dict = rt.to_dict() if hasattr(rt, 'to_dict') else str(rt)
            logger.debug(f"reply_to structure: {rt_dict}")
            
            # Priority 1: reply_to_top_id (this IS the topic_id in forum groups)
            top_id = getattr(rt, "reply_to_top_id", None)
            if top_id:
                return top_id
            
            # Priority 2: reply_to_msg_id when forum_topic flag is set
            # This happens for first-level messages in a topic
            forum_flag = getattr(rt, "forum_topic", False)
            reply_msg_id = getattr(rt, "reply_to_msg_id", None)
            if forum_flag and reply_msg_id:
                return reply_msg_id
            
            # Priority 3: Just reply_to_msg_id (might be topic_id for direct topic messages)
            if reply_msg_id:
                return reply_msg_id
            
            # Priority 4: Message itself is a topic opener
            if getattr(msg, "forum_topic", False):
                return msg.id
            
            return None
        except Exception as e:
            logger.debug(f"Error extracting topic_id: {e}")
            return None
    
    def get_role_mention(self, guild):
        """Get the premium+ role mention (support multiple names)"""
        try:
            for role_name in PREMIUM_PLUS_ROLE_NAMES:
                role = discord.utils.get(guild.roles, name=role_name.strip())
                if role:
                    return role.mention
            
            logger.warning(f"Role {PREMIUM_PLUS_ROLE_NAMES} not found in server {guild.name}")
            return "@Premium+"
        except Exception as e:
            logger.error(f"Error getting role mention: {e}")
            return "@Premium+"
    
    def setup_telegram_handlers(self):
        @self.tg_client.on(events.NewMessage(chats=FORUM_CHAT_ID))
        async def handle_new_message(event):
            try:
                # Debug: Log setiap pesan yang diterima
                logger.info(f"Received message from chat {event.chat_id}")
                
                # Get chat info untuk logging
                chat = await event.get_chat()
                chat_name = getattr(chat, 'title', 'Unknown Chat')
                logger.info(f"Chat: {chat_name} (ID: {event.chat_id})")
                
                # Extract topic_id directly from message structure
                topic_id = self._extract_topic_id(event.message)
                
                # If not found, try re-fetching the full message
                if topic_id is None:
                    try:
                        logger.debug("Trying to re-fetch message for complete data...")
                        full_msg = await self.tg_client.get_messages(FORUM_CHAT_ID, ids=event.message.id)
                        if full_msg:
                            topic_id = self._extract_topic_id(full_msg)
                    except Exception as e:
                        logger.debug(f"Re-fetch message failed: {e}")
                
                # Debug: Log message structure if extraction failed
                if topic_id is None:
                    raw = getattr(event.message, 'to_dict', None)
                    if callable(raw):
                        d = raw()
                        safe_keys = {k: d.get(k) for k in ['id', 'peer_id', 'reply_to', 'forum_topic', 'fwd_from', 'post', 'from_id']}
                        logger.info(f"Message structure (trimmed): {safe_keys}")
                    
                    logger.info("No topic_id found -> ignoring (we only accept forum thread messages)")
                    return
                
                logger.info(f"Detected topic_id={topic_id}")
                
                # CRITICAL FILTER: Check if topic_id is in allowed set
                if topic_id not in ALLOWED_TOPIC_IDS:
                    logger.info(f"topic_id {topic_id} not in ALLOWED_TOPIC_IDS {ALLOWED_TOPIC_IDS} -> ignoring")
                    return
                
                topic_info = f" (Topic {topic_id})"
                    
                logger.info(f"Message accepted from{topic_info}")
                
                # Tentukan Discord channel - STRICT ROUTING (no fallback)
                discord_channel_id = TOPIC_TO_DISCORD_CHANNEL.get(topic_id)
                if not discord_channel_id:
                    logger.error(f"No Discord channel mapped for topic_id={topic_id}. Drop.")
                    return
                
                # Get Discord channel
                discord_channel = self.discord_client.get_channel(discord_channel_id)
                if not discord_channel:
                    logger.error(f"Discord channel {discord_channel_id} not found")
                    return
                
                # Get role mention
                role_mention = self.get_role_mention(discord_channel.guild)
                
                # Format the message
                message_text = event.message.text or ""
                
                # Get current time in Jakarta timezone
                jakarta_time = datetime.now(JAKARTA_TZ)
                
                # Create embed for Discord (TANPA SENDER NAME)
                embed = discord.Embed(
                    description=message_text,
                    color=0x0099ff,
                    timestamp=jakarta_time
                )
                embed.set_footer(text=f"From: {chat_name}{topic_info}")
                
                # HANYA tambahkan disclaimer jika dari topic 39
                if topic_id == 39:
                    embed.add_field(
                        name="DISCLAIMER", 
                        value="**TETAP JAGA RISK MANAGEMENT!**\nTradingmu adalah tanggung jawabmu sendiri.", 
                        inline=False
                    )
                
                # Prepare the mention message
                mention_text = f"{role_mention}"
                
                # Handle media
                if event.message.media:
                    if event.message.photo:
                        try:
                            import uuid
                            photo_filename = f"photo_{uuid.uuid4().hex[:8]}.jpg"
                            photo_path = await event.message.download_media(file=photo_filename)
                            
                            if photo_path and os.path.exists(photo_path):
                                with open(photo_path, 'rb') as f:
                                    file = discord.File(f, filename='image.jpg')
                                    await discord_channel.send(content=mention_text, embed=embed, file=file)
                                os.remove(photo_path)
                                logger.info(f"Photo forwarded to Discord")
                            else:
                                logger.error("Photo download failed")
                                embed.add_field(name="Photo", value="Photo download failed", inline=False)
                                await discord_channel.send(content=mention_text, embed=embed)
                        except Exception as photo_error:
                            logger.error(f"Photo handling error: {photo_error}")
                            embed.add_field(name="Photo", value="Photo forwarding failed", inline=False)
                            await discord_channel.send(content=mention_text, embed=embed)
                    elif event.message.document:
                        if event.message.document.size < 8 * 1024 * 1024:
                            try:
                                doc_path = await event.message.download_media()
                                if doc_path and os.path.exists(doc_path):
                                    with open(doc_path, 'rb') as f:
                                        filename = 'document'
                                        if hasattr(event.message.document, 'attributes') and event.message.document.attributes:
                                            for attr in event.message.document.attributes:
                                                if hasattr(attr, 'file_name') and attr.file_name:
                                                    filename = attr.file_name
                                                    break
                                        file = discord.File(f, filename=filename)
                                        await discord_channel.send(content=mention_text, embed=embed, file=file)
                                    os.remove(doc_path)
                                    logger.info(f"Document forwarded to Discord")
                                else:
                                    logger.error("Document download failed")
                                    embed.add_field(name="Document", value="Document download failed", inline=False)
                                    await discord_channel.send(content=mention_text, embed=embed)
                            except Exception as doc_error:
                                logger.error(f"Document handling error: {doc_error}")
                                embed.add_field(name="Document", value="Document forwarding failed", inline=False)
                                await discord_channel.send(content=mention_text, embed=embed)
                        else:
                            embed.add_field(name="File", value="File too large to forward (>8MB)", inline=False)
                            await discord_channel.send(content=mention_text, embed=embed)
                            logger.info(f"Large file notification sent to Discord")
                    else:
                        embed.add_field(name="Media", value="Media file forwarded", inline=False)
                        await discord_channel.send(content=mention_text, embed=embed)
                        logger.info(f"Other media forwarded to Discord")
                else:
                    if message_text.strip():
                        await discord_channel.send(content=mention_text, embed=embed)
                        logger.info(f"Text message forwarded to Discord")
                
                logger.info(f"Message forwarded from {chat_name}{topic_info} to Discord with role mention")
                
            except Exception as e:
                logger.error(f"Error handling Telegram message: {e}", exc_info=True)
    
    def setup_discord_handlers(self):
        @self.discord_client.event
        async def on_ready():
            logger.info(f'Discord bot logged in as {self.discord_client.user}')
            logger.info(f'Bot is in {len(self.discord_client.guilds)} servers')
            
            for guild in self.discord_client.guilds:
                logger.info(f'Server: {guild.name} (ID: {guild.id})')
                
                # Check untuk role premium+
                found_role = None
                for role_name in PREMIUM_PLUS_ROLE_NAMES:
                    role = discord.utils.get(guild.roles, name=role_name.strip())
                    if role:
                        found_role = role
                        logger.info(f'  Found role: {role.name} (ID: {role.id})')
                        break
                
                if not found_role:
                    logger.warning(f'  Role {PREMIUM_PLUS_ROLE_NAMES} not found!')
                    logger.info(f'  Available roles: {[role.name for role in guild.roles]}')
                
                # Log all channels
                logger.info(f'  Channels in {guild.name}:')
                for channel in guild.text_channels:
                    logger.info(f'    Channel: #{channel.name} (ID: {channel.id})')
        
        @self.discord_client.event
        async def on_error(event, *args, **kwargs):
            logger.error(f'Discord error in {event}: {args}', exc_info=True)
    
    async def start(self):
        """Start both clients"""
        try:
            logger.info("Starting Telegram to Discord forwarder...")
            
            await self.tg_client.start()
            logger.info("Telegram client started successfully")
            
            logger.info(f"Using direct topic_id extraction (no GetForumTopicsRequest needed)")
            logger.info(f"Allowed topic IDs: {ALLOWED_TOPIC_IDS}")
            logger.info(f"Topic to Discord channel mapping: {TOPIC_TO_DISCORD_CHANNEL}")
            
            me = await self.tg_client.get_me()
            logger.info(f"Logged in as: {me.first_name} {me.last_name or ''} (@{me.username or 'no_username'})")
            
            discord_task = asyncio.create_task(self.discord_client.start(DISCORD_TOKEN))
            
            try:
                await discord_task
            except KeyboardInterrupt:
                logger.info("Received interrupt signal, shutting down...")
            
        except Exception as e:
            logger.error(f"Error starting clients: {e}", exc_info=True)
        finally:
            logger.info("Cleaning up...")
            await self.tg_client.disconnect()
            await self.discord_client.close()

async def main():
    logger.info("Starting Telegram to Discord forwarder...")
    forwarder = TelegramToDiscordForwarder()
    await forwarder.start()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Program interrupted by user")
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)