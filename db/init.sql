--
-- PostgreSQL database dump
--

\restrict HyULDI4DT1hBsyyBcULzQWWMFkZgZwNl4sMTkRNAyyiYHDR4fdZ4SSeoXNnYuGM

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
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
-- Name: avatars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avatars (
    id uuid NOT NULL,
    name character varying(100) NOT NULL,
    image_url character varying(500) NOT NULL,
    category character varying(50) NOT NULL,
    description text,
    organization_id uuid NOT NULL,
    voice_id character varying(100),
    profile jsonb NOT NULL,
    created_at timestamp without time zone
);


--
-- Name: chat_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_conversations (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    avatar_id uuid NOT NULL,
    title character varying(120) NOT NULL,
    mode character varying(10) NOT NULL,
    ended_at timestamp without time zone,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    role character varying(20) NOT NULL,
    content text NOT NULL,
    created_at timestamp without time zone
);


--
-- Name: conversation_evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_evaluations (
    id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    overall_score double precision NOT NULL,
    result jsonb NOT NULL,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


--
-- Name: conversation_recordings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_recordings (
    conversation_id uuid NOT NULL,
    mime_type character varying(64) NOT NULL,
    duration_ms integer,
    size_bytes integer NOT NULL,
    audio bytea NOT NULL,
    created_at timestamp without time zone
);
ALTER TABLE ONLY public.conversation_recordings ALTER COLUMN audio SET STORAGE EXTERNAL;


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid NOT NULL,
    name character varying(150) NOT NULL,
    slug character varying(80) NOT NULL,
    status character varying(20) NOT NULL,
    settings jsonb,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


--
-- Name: revoked_jti; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.revoked_jti (
    jti character varying(64) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid NOT NULL,
    name character varying(50) NOT NULL,
    created_at timestamp without time zone
);


--
-- Name: token_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_session (
    jti character varying(64) NOT NULL,
    user_id uuid,
    client_ip character varying(64) NOT NULL,
    user_agent character varying(400) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone
);


--
-- Name: user_selections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_selections (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    avatar_id uuid NOT NULL,
    selected_at timestamp without time zone
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    cognito_sub character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    nome character varying(100) NOT NULL,
    cognome character varying(100) NOT NULL,
    role_id uuid NOT NULL,
    organization_id uuid,
    status character varying(20) NOT NULL,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


--
-- Name: avatars avatars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avatars
    ADD CONSTRAINT avatars_pkey PRIMARY KEY (id);


--
-- Name: chat_conversations chat_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: conversation_evaluations conversation_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_evaluations
    ADD CONSTRAINT conversation_evaluations_pkey PRIMARY KEY (id);


--
-- Name: conversation_recordings conversation_recordings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_recordings
    ADD CONSTRAINT conversation_recordings_pkey PRIMARY KEY (conversation_id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: revoked_jti revoked_jti_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revoked_jti
    ADD CONSTRAINT revoked_jti_pkey PRIMARY KEY (jti);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: token_session token_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_session
    ADD CONSTRAINT token_session_pkey PRIMARY KEY (jti);


--
-- Name: user_selections user_selections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_selections
    ADD CONSTRAINT user_selections_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: ix_avatars_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_avatars_category ON public.avatars USING btree (category);


--
-- Name: ix_avatars_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_avatars_id ON public.avatars USING btree (id);


--
-- Name: ix_avatars_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_avatars_organization_id ON public.avatars USING btree (organization_id);


--
-- Name: ix_chat_conversations_avatar_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_chat_conversations_avatar_id ON public.chat_conversations USING btree (avatar_id);


--
-- Name: ix_chat_conversations_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_chat_conversations_id ON public.chat_conversations USING btree (id);


--
-- Name: ix_chat_conversations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_chat_conversations_user_id ON public.chat_conversations USING btree (user_id);


--
-- Name: ix_chat_messages_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_chat_messages_conversation_id ON public.chat_messages USING btree (conversation_id);


--
-- Name: ix_chat_messages_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_chat_messages_id ON public.chat_messages USING btree (id);


--
-- Name: ix_conversation_evaluations_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_conversation_evaluations_conversation_id ON public.conversation_evaluations USING btree (conversation_id);


--
-- Name: ix_conversation_evaluations_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_conversation_evaluations_id ON public.conversation_evaluations USING btree (id);


--
-- Name: ix_organizations_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_organizations_name ON public.organizations USING btree (name);


--
-- Name: ix_organizations_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_organizations_slug ON public.organizations USING btree (slug);


--
-- Name: ix_revoked_jti_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_revoked_jti_expires_at ON public.revoked_jti USING btree (expires_at);


--
-- Name: ix_roles_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_roles_name ON public.roles USING btree (name);


--
-- Name: ix_token_session_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_token_session_expires_at ON public.token_session USING btree (expires_at);


--
-- Name: ix_token_session_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_token_session_user_id ON public.token_session USING btree (user_id);


--
-- Name: ix_user_selections_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_selections_id ON public.user_selections USING btree (id);


--
-- Name: ix_user_selections_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_selections_user_id ON public.user_selections USING btree (user_id);


--
-- Name: ix_users_cognito_sub; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_users_cognito_sub ON public.users USING btree (cognito_sub);


--
-- Name: ix_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_users_email ON public.users USING btree (email);


--
-- Name: ix_users_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_users_organization_id ON public.users USING btree (organization_id);


--
-- Name: ix_users_role_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_users_role_id ON public.users USING btree (role_id);


--
-- Name: avatars avatars_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avatars
    ADD CONSTRAINT avatars_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: chat_conversations chat_conversations_avatar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_avatar_id_fkey FOREIGN KEY (avatar_id) REFERENCES public.avatars(id);


--
-- Name: chat_conversations chat_conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: chat_messages chat_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_evaluations conversation_evaluations_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_evaluations
    ADD CONSTRAINT conversation_evaluations_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_recordings conversation_recordings_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_recordings
    ADD CONSTRAINT conversation_recordings_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: user_selections user_selections_avatar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_selections
    ADD CONSTRAINT user_selections_avatar_id_fkey FOREIGN KEY (avatar_id) REFERENCES public.avatars(id);


--
-- Name: user_selections user_selections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_selections
    ADD CONSTRAINT user_selections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: users users_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: users users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- PostgreSQL database dump complete
--

\unrestrict HyULDI4DT1hBsyyBcULzQWWMFkZgZwNl4sMTkRNAyyiYHDR4fdZ4SSeoXNnYuGM

