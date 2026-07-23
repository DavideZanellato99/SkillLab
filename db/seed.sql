--
-- PostgreSQL database dump
--

\restrict qxU2x0b9GApQ1e7z8KnBmRVohg8ebU5tnGL3AKsN8ZDNZzAbBOoXblUGE4Ueh4c

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

--
-- Data for Name: organizations; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.organizations (id, name, slug, status, settings, created_at, updated_at) VALUES ('ac603ad8-6981-49f7-a089-2ca7d4973729', 'Mediolanum', 'med', 'active', NULL, '2026-07-22 20:03:56.139666', '2026-07-22 20:03:56.13967');


--
-- Data for Name: avatars; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.avatars (id, name, image_url, category, description, organization_id, voice_id, profile, created_at) VALUES ('a7d5a95a-aafa-4f70-9bf4-3987fbf0bc13', 'Giovanni Salemmi', '/static/avatars/giovanni_salemmi.svg', 'Clienti', 'Cliente al telefono: la sua carta di credito è stata rifiutata alla cassa del supermercato e chiama arrabbiato il servizio clienti per capire perché e risolvere subito.', 'ac603ad8-6981-49f7-a089-2ca7d4973729', NULL, '{"NOME": "Giovanni", "PAURE": "Frodi e truffe, solitudine, divorzio.", "RUOLO": "Operaio meccanico", "SESSO": "Maschio", "DEBITI": "0", "AZIENDA": "Car spa", "COGNOME": "Salemmi", "SEGRETI": "Ha paura che Mediolanum non sia una banca affidabile.", "ID_AVATAR": "001", "LIQUIDITA": "5.000,00 euro", "PATRIMONIO": "80.000,00 euro", "USO_IRONIA": "Si, moderato", "ASPIRAZIONI": "Mantenere la famiglia unita ed il lavoro che ha.", "NAZIONALITA": "Italiana", "PROFESSIONE": "Meccanico", "DATA_NASCITA": "09/12/1999", "ETA_FIGLIO_1": "1 anno", "ETA_FIGLIO_2": "/", "LINGUA_MADRE": "Italiano", "NOME_CONIUGE": "Sara", "NUMERO_FIGLI": "1", "STATO_CIVILE": "Sposato", "USO_DIALETTO": "No", "LUOGO_NASCITA": "Milano", "REDDITO_ANNUO": "35.000,00 euro", "TIPO_SCENARIO": "Chiama il customer banking center (servizio clienti) di Banca Mediolanum per chiedere delucidazioni sul perché la sua carta di credito risulti bloccata. È arrabbiato: è stato al supermercato sotto casa sua e alla cassa la carta non ha funzionato. Ha provato più volte. Lui non sa la motivazione. È convinto di non aver esaurito il massimale. Si lamenta vigorosamente del disservizio.", "CITTA_RESIDENZA": "Milano", "LIVELLO_FIDUCIA": "30%", "CAPACITA_ASCOLTO": "50%", "FATTI_IMMUTABILI": "È nato il 09/12/1999, vive a Milano, ha una moglie e un figlio.", "GRADO_DIFFICOLTA": "8/10", "LIVELLO_EMPATICO": "40%", "LIVELLO_PAZIENZA": "30%", "STORIA_PERSONALE": "Molti amici, famiglia tradizionale, ha perso il padre a 16 anni.", "TITOLO_DI_STUDIO": "Diploma superiore", "TRIGGER_NEGATIVI": "Fretta, incompetenza, lunghe attese, linguaggio troppo tecnico", "TRIGGER_POSITIVI": "Empatia, rassicurazione, competenza", "VELOCITA_PARLATO": "Alta", "ANIMALI_DOMESTICI": "/", "EMOZIONE_INIZIALE": "Arrabbiato", "IMMOBILI_POSSEDUTI": "1", "INTENSITA_EMOZIONE": "Alta", "OBIETTIVO_NASCOSTO": "Capire se l''operatore sa gestire il contatto con empatia, riuscendo a tranquillizzare il cliente e risolvendo la problematica.", "OBIEZIONI_PREVISTE": "Afferma di non aver mai sbagliato il PIN (ma potrebbe sbagliarsi).", "ARGOMENTI_SENSIBILI": "/", "OBIETTIVI_PERSONALI": "Far star bene la sua famiglia a livello economico, almeno una vacanza all''anno.", "PROFESSIONE_CONIUGE": "Dentista", "PROPENSIONE_RISCHIO": "40%", "EVENTI_SIGNIFICATIVI": "Nascita di un figlio, morte del padre.", "FORMALITA_LINGUAGGIO": "Informale", "LIVELLO_ESTROVERSIONE": "60%", "PROPENSIONE_CONFLITTO": "60%", "INTERRUZIONI_FREQUENTI": "Si", "INVESTIMENTI_POSSEDUTI": "Fondo pensione", "PERSONALITA_DESCRIZIONE": "Irascibile, emotivo", "CHI_INIZIA_CONVERSAZIONE": "", "DESCRIZIONE_PROBLEMATICA": "Carta di credito non funzionante. Motivazione: blocco dovuto a somma di inserimenti PIN errati, deve richiedere lo sblocco. (Lui non conosce la motivazione.)", "LIVELLO_CONOSCENZA_MUTUI": "Basso", "LUNGHEZZA_MEDIA_RISPOSTE": "Media", "LIVELLO_CONOSCENZA_BANCARIA": "Bassa", "LIVELLO_CONOSCENZA_PREVIDENZA": "Basso", "LIVELLO_CONOSCENZA_INVESTIMENTI": "Basso", "INFORMAZIONI_DA_NON_RIVELARE_SPONTANEAMENTE": "Ha prestato la carta alla moglie e non sa se lei abbia sbagliato o meno il PIN."}', '2026-07-17 10:15:07.670872');


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.roles (id, name, created_at) VALUES ('d5630d3f-729b-4346-a3cc-144c6daa53bc', 'super_admin', '2026-07-22 19:55:56.085759');
INSERT INTO public.roles (id, name, created_at) VALUES ('e81aa188-86eb-4b66-96b1-104b51dde17f', 'organization_admin', '2026-07-22 19:55:56.085768');
INSERT INTO public.roles (id, name, created_at) VALUES ('8257ec67-3ef4-4213-b4c8-7695b470b43b', 'user', '2026-07-22 19:55:56.085771');


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.users (id, cognito_sub, email, nome, cognome, role_id, organization_id, status, created_at, updated_at) VALUES ('9d59e56a-1179-4e36-83db-bfc886d54fe5', 'mock-admin-sub-0000-0000-0000', 'admin', 'Admin', 'Mock', 'd5630d3f-729b-4346-a3cc-144c6daa53bc', NULL, 'active', '2026-07-22 19:55:56.101737', '2026-07-22 19:55:56.10174');
INSERT INTO public.users (id, cognito_sub, email, nome, cognome, role_id, organization_id, status, created_at, updated_at) VALUES ('81e65402-e0f0-4455-9db2-a71fa6ad7b20', '232498c2-3091-7033-739d-95b4d15c0a78', 'davzan1999@gmail.com', 'Davide', 'Zanellato', '8257ec67-3ef4-4213-b4c8-7695b470b43b', 'ac603ad8-6981-49f7-a089-2ca7d4973729', 'active', '2026-07-17 09:19:49.727958', '2026-07-22 20:04:10.327099');


--
-- PostgreSQL database dump complete
--

\unrestrict qxU2x0b9GApQ1e7z8KnBmRVohg8ebU5tnGL3AKsN8ZDNZzAbBOoXblUGE4Ueh4c

