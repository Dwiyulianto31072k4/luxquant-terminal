--
-- PostgreSQL database dump
--

\restrict V1QfMSnLLK3MHMjhfRZcAjK0Ae8sbSBbzpdBDPAf1hJGqt5cvGwhmMRcmNELI63

-- Dumped from database version 16.11 (Ubuntu 16.11-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.11 (Ubuntu 16.11-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _cache_outcomes; Type: TABLE; Schema: public; Owner: luxq
--

CREATE UNLOGGED TABLE public._cache_outcomes (
    signal_id text,
    outcome text
);


ALTER TABLE public._cache_outcomes OWNER TO luxq;

--
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    user_id integer NOT NULL,
    plan_id integer NOT NULL,
    amount_usdt numeric(10,2) NOT NULL,
    tx_hash character varying(100),
    wallet_from character varying(50),
    wallet_to character varying(50),
    network character varying(20) DEFAULT 'BSC'::character varying,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    verified_at timestamp with time zone,
    expires_at timestamp with time zone,
    bscscan_data jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payments_id_seq OWNER TO postgres;

--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: signal_updates; Type: TABLE; Schema: public; Owner: luxq
--

CREATE TABLE public.signal_updates (
    signal_id text,
    channel_id bigint NOT NULL,
    update_message_id bigint NOT NULL,
    message_link text,
    update_type text NOT NULL,
    price real,
    update_at text,
    raw_text text,
    reply_to_msg_id bigint,
    linked_msg_id bigint
);


ALTER TABLE public.signal_updates OWNER TO luxq;

--
-- Name: signals; Type: TABLE; Schema: public; Owner: luxq
--

CREATE TABLE public.signals (
    signal_id text NOT NULL,
    channel_id bigint,
    call_message_id bigint,
    message_link text,
    pair text,
    entry real,
    target1 real,
    target2 real,
    target3 real,
    target4 real,
    stop1 real,
    stop2 real,
    risk_level text,
    volume_rank_num bigint,
    volume_rank_den bigint,
    created_at text,
    status text,
    raw_text text,
    text_sha1 text,
    edit_date text,
    market_cap text,
    risk_reasons text,
    entry_chart_path text,
    latest_chart_path text,
    chart_status text DEFAULT 'pending'::text
);


ALTER TABLE public.signals OWNER TO luxq;

--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.subscription_plans (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    label character varying(100) NOT NULL,
    description text DEFAULT ''::text,
    price_usdt numeric(10,2) NOT NULL,
    duration_days integer,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.subscription_plans OWNER TO postgres;

--
-- Name: subscription_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.subscription_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.subscription_plans_id_seq OWNER TO postgres;

--
-- Name: subscription_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.subscription_plans_id_seq OWNED BY public.subscription_plans.id;


--
-- Name: tips; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tips (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    cover_image character varying(500),
    pdf_path character varying(500) NOT NULL,
    category character varying(100) DEFAULT 'General'::character varying,
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true
);


ALTER TABLE public.tips OWNER TO postgres;

--
-- Name: tips_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tips_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tips_id_seq OWNER TO postgres;

--
-- Name: tips_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tips_id_seq OWNED BY public.tips.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    username character varying(100) NOT NULL,
    password_hash character varying(255),
    is_active boolean DEFAULT true,
    is_verified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_admin boolean DEFAULT false,
    role character varying(20) DEFAULT 'free'::character varying,
    auth_provider character varying(50) DEFAULT 'local'::character varying,
    google_id character varying(255),
    avatar_url text,
    telegram_id bigint,
    telegram_username character varying(100),
    subscription_expires_at timestamp with time zone,
    subscription_granted_by integer,
    subscription_granted_at timestamp with time zone,
    subscription_note text
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: watchlist; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.watchlist (
    id integer NOT NULL,
    user_id integer NOT NULL,
    signal_id character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.watchlist OWNER TO postgres;

--
-- Name: watchlist_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.watchlist_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.watchlist_id_seq OWNER TO postgres;

--
-- Name: watchlist_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.watchlist_id_seq OWNED BY public.watchlist.id;


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: subscription_plans id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_plans ALTER COLUMN id SET DEFAULT nextval('public.subscription_plans_id_seq'::regclass);


--
-- Name: tips id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tips ALTER COLUMN id SET DEFAULT nextval('public.tips_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: watchlist id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.watchlist ALTER COLUMN id SET DEFAULT nextval('public.watchlist_id_seq'::regclass);


--
-- Name: signals idx_16386_sqlite_autoindex_signals_1; Type: CONSTRAINT; Schema: public; Owner: luxq
--

ALTER TABLE ONLY public.signals
    ADD CONSTRAINT idx_16386_sqlite_autoindex_signals_1 PRIMARY KEY (signal_id);


--
-- Name: signal_updates idx_16392_sqlite_autoindex_signal_updates_1; Type: CONSTRAINT; Schema: public; Owner: luxq
--

ALTER TABLE ONLY public.signal_updates
    ADD CONSTRAINT idx_16392_sqlite_autoindex_signal_updates_1 PRIMARY KEY (channel_id, update_message_id, update_type);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: subscription_plans subscription_plans_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_name_key UNIQUE (name);


--
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);


--
-- Name: tips tips_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tips
    ADD CONSTRAINT tips_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_google_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_google_id_key UNIQUE (google_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_telegram_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_telegram_id_key UNIQUE (telegram_id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: watchlist watchlist_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_pkey PRIMARY KEY (id);


--
-- Name: watchlist watchlist_user_id_signal_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_user_id_signal_id_key UNIQUE (user_id, signal_id);


--
-- Name: idx_16386_idx_signals_callid; Type: INDEX; Schema: public; Owner: luxq
--

CREATE INDEX idx_16386_idx_signals_callid ON public.signals USING btree (call_message_id);


--
-- Name: idx_16386_idx_signals_pair; Type: INDEX; Schema: public; Owner: luxq
--

CREATE INDEX idx_16386_idx_signals_pair ON public.signals USING btree (pair);


--
-- Name: idx_16386_idx_signals_status; Type: INDEX; Schema: public; Owner: luxq
--

CREATE INDEX idx_16386_idx_signals_status ON public.signals USING btree (status);


--
-- Name: idx_16386_sqlite_autoindex_signals_2; Type: INDEX; Schema: public; Owner: luxq
--

CREATE UNIQUE INDEX idx_16386_sqlite_autoindex_signals_2 ON public.signals USING btree (call_message_id);


--
-- Name: idx_16392_idx_updates_sid; Type: INDEX; Schema: public; Owner: luxq
--

CREATE INDEX idx_16392_idx_updates_sid ON public.signal_updates USING btree (signal_id);


--
-- Name: idx_16392_idx_updates_uid; Type: INDEX; Schema: public; Owner: luxq
--

CREATE INDEX idx_16392_idx_updates_uid ON public.signal_updates USING btree (update_message_id);


--
-- Name: idx_cache_outcomes_out; Type: INDEX; Schema: public; Owner: luxq
--

CREATE INDEX idx_cache_outcomes_out ON public._cache_outcomes USING btree (outcome);


--
-- Name: idx_cache_outcomes_sid; Type: INDEX; Schema: public; Owner: luxq
--

CREATE INDEX idx_cache_outcomes_sid ON public._cache_outcomes USING btree (signal_id);


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_status ON public.payments USING btree (status);


--
-- Name: idx_payments_tx_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_tx_hash ON public.payments USING btree (tx_hash);


--
-- Name: idx_payments_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_user ON public.payments USING btree (user_id);


--
-- Name: idx_payments_user_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_user_status ON public.payments USING btree (user_id, status);


--
-- Name: idx_signal_updates_signal_time; Type: INDEX; Schema: public; Owner: luxq
--

CREATE INDEX idx_signal_updates_signal_time ON public.signal_updates USING btree (signal_id, update_at);


--
-- Name: idx_signals_callid; Type: INDEX; Schema: public; Owner: luxq
--

CREATE INDEX idx_signals_callid ON public.signals USING btree (call_message_id);


--
-- Name: idx_signals_pair; Type: INDEX; Schema: public; Owner: luxq
--

CREATE INDEX idx_signals_pair ON public.signals USING btree (pair);


--
-- Name: idx_signals_pair_call_id; Type: INDEX; Schema: public; Owner: luxq
--

CREATE INDEX idx_signals_pair_call_id ON public.signals USING btree (pair, call_message_id DESC);


--
-- Name: idx_signals_pair_created_at; Type: INDEX; Schema: public; Owner: luxq
--

CREATE INDEX idx_signals_pair_created_at ON public.signals USING btree (pair, created_at DESC);


--
-- Name: idx_signals_status; Type: INDEX; Schema: public; Owner: luxq
--

CREATE INDEX idx_signals_status ON public.signals USING btree (status);


--
-- Name: idx_signals_status_created_at; Type: INDEX; Schema: public; Owner: luxq
--

CREATE INDEX idx_signals_status_created_at ON public.signals USING btree (status, created_at DESC);


--
-- Name: idx_tips_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tips_active ON public.tips USING btree (is_active);


--
-- Name: idx_tips_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tips_category ON public.tips USING btree (category);


--
-- Name: idx_tips_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tips_created ON public.tips USING btree (created_at DESC);


--
-- Name: idx_updates_sid; Type: INDEX; Schema: public; Owner: luxq
--

CREATE INDEX idx_updates_sid ON public.signal_updates USING btree (signal_id);


--
-- Name: idx_updates_uid; Type: INDEX; Schema: public; Owner: luxq
--

CREATE INDEX idx_updates_uid ON public.signal_updates USING btree (update_message_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_google_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_google_id ON public.users USING btree (google_id);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_users_sub_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_sub_expires ON public.users USING btree (subscription_expires_at) WHERE (subscription_expires_at IS NOT NULL);


--
-- Name: idx_users_telegram_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_telegram_id ON public.users USING btree (telegram_id);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_username ON public.users USING btree (username);


--
-- Name: idx_watchlist_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_watchlist_user_id ON public.watchlist USING btree (user_id);


--
-- Name: uq_signals_call_mid; Type: INDEX; Schema: public; Owner: luxq
--

CREATE UNIQUE INDEX uq_signals_call_mid ON public.signals USING btree (call_message_id);


--
-- Name: uq_updates_chan_mid_type; Type: INDEX; Schema: public; Owner: luxq
--

CREATE UNIQUE INDEX uq_updates_chan_mid_type ON public.signal_updates USING btree (channel_id, update_message_id, update_type);


--
-- Name: payments payments_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);


--
-- Name: payments payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tips tips_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tips
    ADD CONSTRAINT tips_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: watchlist watchlist_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO luxq;
GRANT ALL ON SCHEMA public TO PUBLIC;
GRANT USAGE ON SCHEMA public TO luxq_readonly;


--
-- Name: TABLE payments; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.payments TO luxq;
GRANT SELECT ON TABLE public.payments TO luxq_readonly;


--
-- Name: SEQUENCE payments_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.payments_id_seq TO luxq;


--
-- Name: TABLE signal_updates; Type: ACL; Schema: public; Owner: luxq
--

GRANT SELECT ON TABLE public.signal_updates TO luxq_readonly;


--
-- Name: TABLE signals; Type: ACL; Schema: public; Owner: luxq
--

GRANT SELECT ON TABLE public.signals TO luxq_readonly;


--
-- Name: TABLE subscription_plans; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.subscription_plans TO luxq;
GRANT SELECT ON TABLE public.subscription_plans TO luxq_readonly;


--
-- Name: SEQUENCE subscription_plans_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.subscription_plans_id_seq TO luxq;


--
-- Name: TABLE tips; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.tips TO luxq;
GRANT SELECT ON TABLE public.tips TO luxq_readonly;


--
-- Name: SEQUENCE tips_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.tips_id_seq TO luxq;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.users TO luxq;
GRANT SELECT ON TABLE public.users TO luxq_readonly;


--
-- Name: SEQUENCE users_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.users_id_seq TO luxq;


--
-- Name: TABLE watchlist; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.watchlist TO luxq;
GRANT SELECT ON TABLE public.watchlist TO luxq_readonly;


--
-- Name: SEQUENCE watchlist_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.watchlist_id_seq TO luxq;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO luxq;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO luxq;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO luxq_readonly;


--
-- PostgreSQL database dump complete
--

\unrestrict V1QfMSnLLK3MHMjhfRZcAjK0Ae8sbSBbzpdBDPAf1hJGqt5cvGwhmMRcmNELI63

