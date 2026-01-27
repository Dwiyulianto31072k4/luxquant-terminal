from sqlalchemy import Column, Integer, BigInteger, String, Float, Text
from app.core.database import Base

class Signal(Base):
    __tablename__ = "signals"
    
    # Primary key - production uses signal_id as TEXT
    signal_id = Column(String, primary_key=True)
    
    # Channel info
    channel_id = Column(BigInteger)
    call_message_id = Column(BigInteger, unique=True)
    message_link = Column(Text)
    
    # Pair (e.g., BTCUSDT)
    pair = Column(String(50), index=True)
    
    # Prices
    entry = Column(Float)
    target1 = Column(Float)
    target2 = Column(Float)
    target3 = Column(Float)
    target4 = Column(Float)
    stop1 = Column(Float)
    stop2 = Column(Float)
    
    # Risk & Volume
    risk_level = Column(String(20))
    volume_rank_num = Column(Integer)
    volume_rank_den = Column(Integer)
    
    # Status: open, tp1, tp2, tp3, closed_win, closed_loss
    status = Column(String(20), default='open', index=True)
    
    # Timestamps & raw data
    created_at = Column(String)  # stored as TEXT in production
    raw_text = Column(Text)
    text_sha1 = Column(String(40))
    edit_date = Column(String)
    
    def __repr__(self):
        return f"<Signal {self.pair} @ {self.entry}>"


class SignalUpdate(Base):
    __tablename__ = "signal_updates"
    
    # Composite primary key
    channel_id = Column(BigInteger, primary_key=True)
    update_message_id = Column(BigInteger, primary_key=True)
    update_type = Column(String(20), primary_key=True)
    
    signal_id = Column(String)
    message_link = Column(Text)
    price = Column(Float)
    update_at = Column(String)
    raw_text = Column(Text)
    reply_to_msg_id = Column(BigInteger)
    linked_msg_id = Column(BigInteger)
