# Documento dei Requisiti Software (DRS)
## Progetto: SforbiciaSmart SaaS Multitenant
**Versione:** 1.0.0  
**Data:** 13 Luglio 2026  
**Autore:** Senior Software Architect & Lead Business Analyst  
**Stato:** Approvato per lo Sviluppo  

---

### Indice del Documento
1. [Visione del Sistema](#1-visione-del-sistema)
2. [Requisiti Funzionali (Dalla A alla Z)](#2-requisiti-funzionali-dalla-a-alla-z)
3. [Requisiti Non Funzionali](#3-requisiti-non-funzionali)
4. [Architettura dei Dati e Schema delle Entità](#4-architettura-dei-dati-e-schema-delle-entità)
5. [Integrazioni Esterne e Servizi Terzi](#5-integrazioni-esterne-e-servizi-terzi)
6. [Compliance Legale, Sicurezza (GDPR) e Limitazioni di Responsabilità](#6-compliance-legale-sicurezza-gdpr-e-limitazioni-di-responsabilità)

---

### 1. Visione del Sistema

#### 1.1 Obiettivo del Progetto
**SforbiciaSmart** è una piattaforma SaaS (Software as a Service) multitenant di livello enterprise, progettata specificamente per digitalizzare ed ottimizzare l'intera gestione operativa, amministrativa e promozionale di saloni di acconciatura e barbieri. L'obiettivo primario è svincolare gli operatori dalla complessità organizzativa manuale, fornendo strumenti di pianificazione in tempo reale, analisi delle performance del team, automazione delle vendite (upselling), campagne di fidelizzazione intelligenti ed un canale di interazione basato su Intelligenza Artificiale per l'ottimizzazione del business (AI Business Coach).

#### 1.2 Pubblico Target (Target Audience)
La piattaforma è strutturata su una logica a livelli di servizio scalabili per coprire tre segmenti principali:
1. **Artigiani Singoli (Piano "Solo Pro"):** Singoli parrucchieri o barbieri autonomi che necessitano di una postazione di lavoro ordinata con agenda e cassa, gestendo un solo punto vendita fisica.
2. **Saloni Medio-Grandi e Reti (Piano "Premium Network"):** Strutture composte da più collaboratori, tariffe personalizzate per cliente e necessità di gestire fino a 6 sedi distinte sotto un'unica interfaccia centralizzata con reportistica collaboratori avanzata.
3. **Franchising e Catene Nazionali (Piani "Elite AI" e "VIP"):** Reti illimitate di saloni con monitoraggio consolidato in tempo reale, cruscotti decisionali intelligenti e accesso illimitato alle funzionalità basate su modelli linguistici di grandi dimensioni (LLM).

#### 1.3 Modello Multitenant e Isolamento
Il sistema implementa un modello architetturale di tipo **SaaS Multitenant con partizionamento logico dei dati**. Ciascun abbonato ("Tenant" o "Salon Owner") è proprietario esclusivo di un perimetro isolato identificato univocamente dal campo `ownerId`. Nessun utente, collaboratore o amministratore di un determinato tenant può visualizzare, alterare o intercettare i dati appartenenti ad un altro tenant.

---

### 2. Requisiti Funzionali (Dalla A alla Z)

Il software è suddiviso in moduli applicativi indipendenti integrati tra loro tramite flussi di messaggistica asincrona e database reattivo.

#### 2.1 Autenticazione, Registrazione e Ruoli (RBAC)
- **Registrazione Salone (Onboarding):** Un nuovo titolare inserisce nome salone, email, password, telefono ed effettua l'onboarding iniziale con l'attivazione automatica di un periodo di prova gratuita (Trial).
- **Autenticazione Sicura:** Login tramite Firebase Authentication con validazione di email e password. Gestione integrata della procedura di recupero password via email.
- **Role-Based Access Control (RBAC):** All'interno di ciascun tenant sono supportati tre ruoli distinti:
  - **Titolare (Owner):** Accesso completo a impostazioni aziendali, fatturazione, piano di abbonamento, provvigioni, reportistica finanziaria, configurazione dei saloni e gestione del team.
  - **Collaboratore (Staff):** Accesso limitato all'agenda dei propri appuntamenti, visualizzazione dei trattamenti assegnati, anagrafica clienti di base, e divieto di visualizzare report di fatturato complessivo o configurazioni di sistema.
  - **Amministratore del Salone (Manager):** Può gestire l'agenda globale del salone, i clienti e le operazioni di cassa quotidiane, ma ha limitazioni sulla modifica del piano di abbonamento o sulla visualizzazione delle provvigioni totali di altri collaboratori, configurabili dal Titolare.

#### 2.2 Gestione Multi-Salone (Sedi Multiple)
- **Configurazione Geografica:** Creazione e modifica delle sedi fisiche del salone (Nome sede, indirizzo completo, recapito telefonico, colore identificativo).
- **Orari di Apertura:** Definizione per ciascun salone dei giorni di apertura e fasce orarie specifiche di lavoro (es. Lunedì chiuso, Martedì-Sabato 09:00 - 19:30).
- **Limiti di Piano:** Il modulo controlla a livello applicativo il numero di saloni inseribili in base al piano attivo (Solo Pro: max 1 salone; Premium Network: max 6 saloni; Elite AI/VIP: illimitati).

#### 2.3 Agenda e Calendario Intelligente (Appointments)
- **Tabella Oraria Interattiva:** Visualizzazione giornaliera e settimanale degli appuntamenti, organizzati in colonne verticali corrispondenti a ciascun collaboratore in turno.
- **Creazione Rapida (Booking Engine):** Modale integrato per l'inserimento di un appuntamento indicando:
  - Cliente (selezionabile da CRM o inseribile al volo come nuovo cliente).
  - Sede (salone in cui si effettua il servizio).
  - Collaboratore assegnato.
  - Servizi multipli (con calcolo automatico della durata cumulativa e del prezzo totale stimato).
  - Data, ora di inizio e note interne protette.
- **Aggiornamento Drag-and-Drop:** Spostamento di blocchi orari con ricalcolo immediato dell'orario di inizio/fine e verifica automatica della disponibilità del collaboratore.
- **Stati dell'Appuntamento:** 
  - `booked` (Prenotato/Confermato).
  - `checked_out` (Completato con transazione di pagamento).
  - `cancelled` (Annullato dal cliente o salone).
  - `no_show` (Cliente assente senza disdetta).

#### 2.4 Anagrafica Clienti e CRM Avanzato
- **Scheda Cliente Completa:** Profilo anagrafico contenente Nome, Cognome, Indirizzo Email, Telefono, Data di Nascita (per promozioni di compleanno), Note Tecniche private (es. tolleranze a tinte o preferenze di taglio).
- **Storico Trattamenti ed Acquisti:** Elenco completo e cronologico di tutte le sedute passate del cliente, servizi eseguiti, prodotti acquistati in magazzino e collaboratori preferiti.
- **Metriche di Valore (Analytics Cliente):** Visualizzazione in tempo reale di:
  - Scontrino medio (Average ticket).
  - Numero di visite totali eseguite negli ultimi 12 mesi.
  - Saldo dei punti fedeltà cumulati.

#### 2.5 Magazzino ed Inventario Prodotti (Inventory)
- **Catalogo Articoli:** Gestione dei prodotti per la vendita (cere, shampoo, lacche) o per uso interno professionale (tinte, ossigeni, detergenti).
- **Campi Prodotto:** Titolo, descrizione, codice a barre (EAN/UPC per lettura ottica), prezzo di vendita al pubblico, costo d'acquisto, aliquota IVA, stock attuale e fornitore.
- **Soglia di Sottoscorta (Alert Threshold):** Configurazione di una quantità minima sotto la quale scatta un avviso visivo (badge rosso di "Sotto Scorta") per indicare la necessità di un nuovo ordine al fornitore.

#### 2.6 Gestione Team, Turni di Lavoro e Provvigioni
- **Scheda Collaboratore:** Nome, Ruolo (barbiere senior, apprendista), Colore grafico per l'agenda, Giorni e Orari di Turno personalizzati.
- **Provvigioni Personalizzate (Commissions):** Configurazione per ciascun membro dello staff di una percentuale di provvigione fissa o dinamica sui servizi eseguiti (es. 10% sui tagli eseguiti) e sui prodotti venduti in cassa (es. 5% sulle cere vendute).
- **Report Provvigioni automatico:** Calcolo mensile o personalizzato degli emolumenti provvigionali spettanti a ciascun collaboratore in base agli scontrini chiusi in cassa che lo vedono come operatore del servizio o venditore del prodotto.

#### 2.7 Flusso di Cassa e Fatturazione Elettronica (POS Checkout)
- **Carrello di Vendita (POS):** Interfaccia per finalizzare l'appuntamento o effettuare una vendita diretta al banco. Permette di inserire servizi, prodotti del magazzino e applicare sconti in percentuale o a valore fisso.
- **Metodi di Pagamento:** Supporto per Contanti (Cash), Carta di Credito/POS fisico, Stripe o Voucher Regalo.
- **Dati per Fatturazione Elettronica:** Raccolta opzionale dei dati fiscali conformi alla normativa italiana:
  - Tipo soggetto (Privato o Azienda).
  - Codice Fiscale (CF).
  - Partita IVA (P.IVA).
  - Codice Destinatario (SDI a 7 caratteri o PEC).
  - Nome Società / Dati anagrafici di fatturazione.
- **Chiusura Fiscale:** Registrazione della transazione con scarico automatico e immediato delle quantità di magazzino per i prodotti inclusi nella vendita.

#### 2.8 Automazioni di Marketing e Comunicazioni (Marketing Modulo)
- **Targeting Intelligente delle Audience:** Filtro automatico dei contatti in base alle abitudini d'acquisto o visite:
  - *Clienti Inattivi:* Chi non effettua visite da oltre 60 giorni.
  - *Clienti Top Spenders:* Chi ha uno scontrino medio o punti fedeltà superiori a una soglia configurabile.
  - *Compleanni del Mese:* Estrazione automatica dei clienti che compiono gli anni nel mese corrente.
- **Automazioni di Compleanno:** Invio automatico a mezzanotte di messaggi promozionali di auguri con coupon sconto.
- **Canale di Invio integrato:** Predisposto per l'invio di Email automatiche di conferma prenotazione, promemoria appuntamento 24 ore prima e promozioni di marketing personalizzate.

#### 2.9 Gestione Abbonamenti e Limiti di Piano (Billing Guard)
- **Controllo dei Limiti in Real-time:** Un sistema di guardie software intercetta le azioni utente e ne blocca l'esecuzione se superano le quote imposte dal piano sottoscritto (es. impedisce di inserire il secondo salone se l'utente è nel piano Solo Pro).
- **Checkout di Abbonamento Stripe:** Integrazione con Stripe Checkout per il pagamento del canone mensile o annuale dei piani Solo Pro, Premium Network o Elite AI.
- **Grace Period & Scadenza:** Gestione automatica dello stato di trial scaduto o pagamento fallito, con reindirizzamento immediato ad una schermata bloccata (Subscription Guard) che consente unicamente l'inserimento di un metodo di pagamento valido o il downgrade al piano base gratuito, per garantire la continuità aziendale senza perdita di dati.

#### 2.10 SforbiciaSmart AI Coach (Assistente Virtuale)
- **Accessibilità Estesa:** Il chatbot intelligente è disponibile per tutti gli utenti a partire dal piano **Solo Pro** (fino a Elite AI e VIP).
- **Business Coach Funzionale:** Consente al titolare del salone di chattare in linguaggio naturale con un esperto di business dei saloni. L'AI risponde a quesiti gestionali, suggerisce strategie di fidelizzazione, suggerimenti sui prezzi e fornisce idee di marketing basate sulla situazione operativa del salone.
- **Analizzatore di Cassa (Generatore di Consigli Upsell):** Durante la finalizzazione della cassa, un servizio IA analizza i servizi eseguiti oggi e lo storico del cliente per suggerire un massimo di 3 prodotti reali in magazzino (con stock > 0) adatti all'up-selling (es. consigliare una lozione post-barba specifica dopo un trattamento di regolazione barba).

---

### 3. Requisiti Non Funzionali

#### 3.1 Sicurezza e Privacy (GDPR Compliance)
- **Tenant Isolation rigoroso:** A livello di database Firestore, tutte le query sono strutturate per contenere la clausola `where("ownerId", "==", currentUser.uid)`. Le regole di sicurezza di Firestore (Firestore Security Rules) applicano questa restrizione a livello di server, rifiutando qualsiasi transazione o lettura di documenti in cui l'ID dell'utente autenticato non corrisponda al campo `ownerId` del record.
- **Protezione delle Credenziali e delle API Key:** Nessuna chiave segreta (es. Stripe Secret, Gemini API Key, Credenziali SMTP di Zoho) è esposta nel codice client. Tutte le richieste esterne sensibili vengono inoltrate ad API proxy sicure situate sul server Express di SforbiciaSmart (`server.ts`).
- **Cifratura del Canale:** Tutte le comunicazioni tra client ed Express server, così come verso i servizi esterni (Stripe, Firebase, Zoho SMTP), avvengono tassativamente su protocollo cifrato **HTTPS** (porta 443) e **SMTP over SSL/TLS** (porta 465).

#### 3.2 Scalabilità e Architettura Serverless
- **Serverless Hosting:** L'applicazione backend Express è ospitata su container gestiti ad alta disponibilità (Google Cloud Run), in grado di scalare istantaneamente da zero a migliaia di istanze concorrenti in base al carico di traffico effettivo.
- **No-SQL Scalability:** L'uso di Cloud Firestore consente una scalabilità orizzontale nativa del database senza colli di bottiglia legati a lock di tabelle relazionali, gestendo milioni di record per salon tenant in modo asincrono ed efficiente.

#### 3.3 Performance, Resilienza e Latenza
- **Caching in Memoria e Long Polling:** Sulle istanze client (comprese le viste embedded in iframe) Firestore è configurato per utilizzare cache in memoria e fallback di tipo *Long Polling* anziché WebSockets persistenti. Ciò garantisce il perfetto funzionamento del sistema anche all'interno di reti aziendali o firewall restrittivi.
- **Lazy Initialization SDK:** Gli SDK di terze parti sensibili (es. Stripe, Gemini) sul server Express vengono inizializzati in modalità "lazy" al primo utilizzo, evitando crash all'avvio del server in caso di temporanea mancanza delle chiavi d'ambiente e permettendo un avvio ultra-rapido.
- **Local Fallback per Algoritmi IA:** Se il server IA di Google Gemini non risponde entro 3000-5000ms a causa di congestione di rete, l'endpoint di up-selling in cassa attiva istantaneamente un motore di raccomandazione locale basato su regole deterministiche scritte in codice (es. associazione testuale tag-prodotto), garantendo zero ritardi durante il checkout del cliente al banco.

#### 3.4 Disponibilità ed Affidabilità (Availability)
- **Uptime Target:** La piattaforma garantisce un livello di disponibilità del servizio pari al **99.9%** su base annua.
- **Gestione Disallineamenti:** In caso di disconnessione internet temporanea del dispositivo in salone, l'interfaccia mantiene gli stati reattivi locali e rinfresca le transazioni non appena la connettività di rete viene ripristinata, prevenendo la perdita di appuntamenti o vendite.

---

### 4. Architettura dei Dati e Schema delle Entità

Di seguito si riportano le strutture logiche dei documenti salvati nel database Firestore per garantire la corretta coerenza relazionale multitenant.

#### 4.1 Entità: `business_settings` (Configurazione del Tenant)
- `ownerId` (String, Primary Key): ID univoco dell'utente Titolare (Firebase Auth UID).
- `salonName` (String): Nome principale del brand/salone.
- `userPlan` (String): Piano attivo (`solo_pro`, `network`, `elite_ai`, `unlimited`).
- `subscriptionStatus` (String): Stato dell'abbonamento (`trialing`, `active`, `past_due`, `cancelled`).
- `billingCycle` (String): Ciclo di fatturazione (`monthly`, `yearly`).
- `subscriptionExpiryDate` (Timestamp): Data di scadenza del piano.
- `trialStartDate` (Timestamp): Data di inizio del periodo di prova.
- `vatNumber` (String): Partita IVA italiana.
- `cfNumber` (String): Codice Fiscale del titolare/azienda.
- `sdiCode` (String): Codice destinatario SDI o pec.

#### 4.2 Entità: `salons` (Punti Vendita)
- `id` (String, Primary Key): ID univoco autogenerato.
- `ownerId` (String): Identificativo del tenant proprietario.
- `name` (String): Nome specifico di questa sede (es. "Sede Centrale", "SforbiciaSmart Duomo").
- `address` (String): Indirizzo fisico.
- `phone` (String): Recapito telefonico dedicato della sede.
- `color` (String): Codice esadecimale associato per visualizzazione.
- `businessHours` (Map): Orari strutturati per giorno della settimana.

#### 4.3 Entità: `team` (Staff & Collaboratori)
- `id` (String, Primary Key): ID univoco.
- `ownerId` (String): Tenant di appartenenza.
- `name` (String): Nome e cognome del collaboratore.
- `role` (String): Ruolo aziendale.
- `colorCode` (String): Colore identificativo utilizzato nell'agenda per i suoi appuntamenti.
- `commissionsRate` (Number): Percentuale di provvigione base per i servizi eseguiti (es. `10` per indicare il 10%).
- `productCommissionRate` (Number): Percentuale di provvigione sulla vendita di prodotti (es. `5` per indicare il 5%).
- `shifts` (Map): Mappatura oraria dei turni di presenza settimanale.

#### 4.4 Entità: `customers` (CRM Clienti)
- `id` (String, Primary Key): ID univoco del cliente.
- `ownerId` (String): Tenant di appartenenza.
- `firstName` (String): Nome.
- `lastName` (String): Cognome.
- `email` (String): Email di contatto.
- `phone` (String): Numero di cellulare.
- `birthDate` (String): Data di nascita (formato `YYYY-MM-DD`).
- `notes` (String): Note storiche e formule tecniche d'uso salone.
- `loyaltyPoints` (Number): Punti fedeltà cumulati.
- `averageTicket` (Number): Valore calcolato dello scontrino medio storico.
- `totalVisits` (Number): Somma delle visite effettuate con transazione completata.

#### 4.5 Entità: `services` (Listino Trattamenti)
- `id` (String, Primary Key): ID univoco del servizio.
- `ownerId` (String): Tenant di appartenenza.
- `name` (String): Nome del trattamento (es. "Taglio Sfumato + Shampoo").
- `category` (String): Categoria (es. "Capelli", "Barba", "Trattamenti").
- `duration` (Number): Durata standard del servizio espressa in minuti (es. `30`, `45`).
- `price` (Number): Prezzo di listino applicato.

#### 4.6 Entità: `inventory` (Magazzino Articoli)
- `id` (String, Primary Key): ID articolo.
- `ownerId` (String): Tenant di appartenenza.
- `name` (String): Nome commerciale del prodotto.
- `barcode` (String): Codice a barre univoco (EAN/UPC).
- `category` (String): Categoria merceologica.
- `stock` (Number): Quantità attualmente disponibile in magazzino.
- `alertThreshold` (Number): Quantità minima d'allerta.
- `price` (Number): Prezzo di vendita al cliente finale.
- `cost` (Number): Costo d'acquisto sostenuto dal salone per la fornitura.
- `supplierName` (String): Denominazione del fornitore commerciale.

#### 4.7 Entità: `appointments` (Agenda)
- `id` (String, Primary Key): ID appuntamento.
- `ownerId` (String): Tenant di appartenenza.
- `customerId` (String): Relazione verso `customers.id`.
- `salonId` (String): Relazione verso `salons.id`.
- `staffId` (String): Relazione verso `team.id` (collaboratore principale).
- `date` (String): Giorno dell'appuntamento (`YYYY-MM-DD`).
- `time` (String): Ora di inizio dell'appuntamento (`HH:MM`).
- `duration` (Number): Durata totale cumulata espressa in minuti.
- `price` (Number): Importo monetario totale stimato o effettivo.
- `status` (String): Stato corrente (`booked`, `checked_out`, `cancelled`, `no_show`).
- `serviceIds` (Array of Strings): Elenco dei codici servizio eseguiti (relazione verso `services.id`).
- `notes` (String): Annotazioni specifiche per l'appuntamento corrente.

#### 4.8 Entità: `transactions` (Fatture e Scontrini POS)
- `id` (String, Primary Key): ID transazione di cassa.
- `ownerId` (String): Tenant di appartenenza.
- `salonId` (String): Sede in cui è avvenuto il pagamento.
- `customerId` (String): Cliente pagatore.
- `appointmentId` (String, Optional): Appuntamento di origine.
- `date` (Timestamp): Data e ora precisa della transazione.
- `items` (Array of Maps): Dettaglio carrello contenente per ogni voce:
  - `type` (String): "service" o "product".
  - `itemId` (String): ID del servizio o prodotto.
  - `name` (String): Nome della voce.
  - `quantity` (Number): Quantità venduta.
  - `price` (Number): Prezzo applicato.
  - `staffId` (String): Collaboratore che ha eseguito o venduto la singola voce.
- `totalAmount` (Number): Totale complessivo pagato.
- `paymentMethod` (String): Metodo (`cash`, `card`, `stripe`).
- `isElectronicInvoicingRequested` (Boolean): Flag richiesta fatturazione.
- `billingData` (Map, Optional): Contiene CF, P.IVA, Codice SDI, Ragione Sociale.

---

### 5. Integrazioni Esterne e Servizi Terzi

Il funzionamento robusto e automatico del software fa affidamento su quattro connettori tecnologici principali gestiti in sicurezza sul backend.

```
                  ┌──────────────────────────────┐
                  │      SforbiciaSmart Client   │
                  │         React (Vite)         │
                  └──────────────┬───────────────┘
                                 │ HTTPS
                  ┌──────────────▼───────────────┐
                  │      Express Server.ts       │
                  │        (Cloud Run)           │
                  └──────────────┬───────────────┘
                                 │
     ┌───────────────────────────┼───────────────────────────┐
     │                           │                           │
┌────▼───────┐             ┌─────▼───────┐             ┌─────▼───────┐
│ Stripe API │             │ Zoho SMTP   │             │ Gemini API  │
│ (Billing)  │             │ (Nodemailer)│             │ (@google/gen│
└────────────┘             └─────────────┘             └─────────────┘
```

#### 5.1 Stripe (Pagamenti & Abbonamenti)
- **Gestione dei Piani Gestionali:** Gestione automatica del ciclo di vita dei pagamenti ricorrenti (SaaS Subscriptions).
- **Integrazione API Server-Side:** In `/api/stripe/checkout-session`, il server genera una sessione di pagamento sicura specificando il Price ID in base al piano scelto (`solo_pro`, `network`, `elite_ai`) ed al ciclo selezionato (mensile/annuale).
- **Webhook e Sicurezza:** Gestione di Webhook per intercettare gli eventi inviati dai server Stripe:
  - `checkout.session.completed`: Aggiorna lo stato nel database attivando il piano acquistato per il rispettivo `ownerId`.
  - `invoice.payment_succeeded`: Rinnova il periodo di validità.
  - `invoice.payment_failed` / `customer.subscription.deleted`: Sposta lo stato del tenant in "expired" bloccando l'accesso tramite la guardia.
- **Sandbox Environment:** Implementazione di una cassa fittizia controllata (`/api/stripe/mock-checkout`) per test integrali di backend/frontend nel sandbox di sviluppo senza toccare i server Stripe live.

#### 5.2 Zoho Mail SMTP (Canale Notifiche)
- **Host di Spedizione:** Connessione al server SMTP professionale di Zoho Mail (`smtppro.zoho.eu` sulla porta `465` con cifratura `SSL/TLS`).
- **Nodemailer Transport:** Configurazione del trasporto sul server Express mediante libreria `nodemailer`, strutturato per leggere dinamicamente i parametri impostati nelle variabili d'ambiente:
  - `MAIL_USERNAME` (info@sforbiciasmart.app)
  - `MAIL_PASSWORD` (Chiave applicativa sicura di Zoho)
  - `MAIL_FROM_ADDRESS` (Indirizzo mittente autorizzato)
  - `MAIL_FROM_NAME` (SforbiciaSmart)
- **Flussi Transazionali Gestiti:**
  - Invio di email di conferma appuntamento per il cliente con data, ora, sede e trattamento.
  - Invio di email di promemoria e disdetta.
  - Invio di messaggi automatici di auguri e promozioni di compleanno.

#### 5.3 Google Gemini API (Modelli Generativi di Linguaggio)
- **SDK di Integrazione:** Utilizzo esclusivo della moderna libreria `@google/genai` installata lato server per impedire l'esposizione delle API Key segrete nel browser client.
- **Modelli Selezionati:**
  - `gemini-3.5-flash`: Modello primario ad altissime prestazioni e bassissima latenza per le risposte del Chatbot Coach e l'analisi degli up-selling.
  - `gemini-3.1-flash-lite`: Modello secondario ad altissima efficienza utilizzato come backup automatico sul server Express in caso di temporanea saturazione delle quote del modello principale.
- **Integrazione Chatbot (SaaS AI Coach - `/api/chat`):** Inoltro della cronologia messaggi e del contesto del salone per fornire analisi strategiche immediate.
- **Integrazione Cassa (Upsell Generativo - `/api/upsell/suggest`):** Invio di un payload JSON contenente i prodotti con stock positivo in salone e la lista dei servizi eseguiti. Il modello risponde con un payload strutturato JSON (`application/json`) con raccomandazioni mirate e badge di up-selling.

#### 5.4 Sistema di Interscambio (Fatturazione Elettronica Italiana)
- **Mapping Fiscale:** Strutturazione dei campi anagrafici del cliente conformemente al formato tracciato XML della Fattura Elettronica (SdI).
- **Validazione Formale:** Controllo sintattico preliminare dei parametri (Lunghezza Partita IVA 11 cifre numeriche, Codice Fiscale 16 caratteri alfanumerici o 11 numerici, Codice SDI a 7 cifre alfanumeriche).

---

### 6. Compliance Legale, Sicurezza (GDPR) e Limitazioni di Responsabilità

#### 6.1 Trattamento dei Dati Personali (GDPR)
In conformità con il Regolamento Generale sulla Protezione dei Dati (GDPR - UE 2016/679), la piattaforma opera distinguendo chiaramente i ruoli di trattamento:
- **Titolare del Trattamento (Data Controller):** Il proprietario del salone ("Salon Owner"), che raccoglie direttamente i dati personali dei propri clienti finali (nomi, telefoni, note chimiche).
- **Responsabile del Trattamento (Data Processor):** La piattaforma SforbiciaSmart, che mette a disposizione l'infrastruttura tecnologica e tratta i dati esclusivamente per conto e secondo le istruzioni del Titolare del salone.

#### 6.2 Registro delle Attività di Trattamento (Art. 30 GDPR)
Il software supporta la predisposizione del Registro dei Trattamenti (RDS) fornendo al Titolare del salone i seguenti dettagli predefiniti relativi ai flussi gestiti sulla piattaforma:
1. **Categorie di Interessati:** Clienti del salone, collaboratori e dipendenti dello staff.
2. **Categorie di Dati Trattati:** Dati identificativi (nome, email, telefono), dati amministrativi (transazioni, scontrini, metodi di pagamento), e dati particolari/tecnici (note su allergie o reazioni chimiche a trattamenti estetici).
3. **Finalità del Trattamento:** Gestione dell'agenda prenotazioni, fatturazione fiscale dei servizi ed invio di comunicazioni transazionali ed informative inerenti il rapporto commerciale.
4. **Misure di Sicurezza Applicate:** Autenticazione crittografica Firebase, cifratura SSL/TLS dei dati in transito, isolamento logico dei tenant nel database, backup automatici gestiti da Google Cloud, e logging centralizzato degli accessi amministrativi.

#### 6.3 Termini e Condizioni di Servizio (T&C) e Esonero da Responsabilità
La piattaforma include nei propri Termini di Servizio clausole specifiche a tutela della continuità operativa e legale del SaaS:
- **Responsabilità sui Dati Fiscali:** La piattaforma raccoglie ed organizza i dati di fatturazione elettronica (Partita IVA, CF, Codice SDI) inseriti dall'utente, ma declina ogni responsabilità circa la correttezza formale, la mancata trasmissione causata da errori nei dati inseriti o sanzioni tributarie derivanti da comportamenti dolosi o colposi dell'utente. È onere del salone avvalersi di un consulente fiscale per l'invio definitivo dei tracciati XML generati.
- **Responsabilità sull'Intelligenza Artificiale (AI Disclaimer):** I consigli forniti dall'AI Coach (SaaSAssistant) e i suggerimenti automatici di up-selling in cassa hanno scopi puramente strategici ed indicativi basati su modelli probabilistici. SforbiciaSmart non garantisce incrementi di fatturato o l'assenza di imprecisioni nei suggerimenti di prodotto e non risponde di eventuali danni diretti o indiretti derivanti dalle decisioni commerciali intraprese sulla base di tali indicazioni.
- **Esonero per Operazioni Offline o Disallineamento Scorte:** La gestione dell'inventario e lo scarico delle scorte di magazzino avvengono in base alle transazioni registrate in cassa. Eventuali disallineamenti fisici causati da vendite non registrate, furti, omaggi o guasti alla connettività internet rientrano nella responsabilità esclusiva dell'operatore del salone.
- **Clausola di Limitazione del Danno (Liability Cap):** In ogni caso, la responsabilità complessiva di SforbiciaSmart per qualsiasi inadempimento o malfunzionamento del software è limitata ad un importo massimo non superiore alla somma dei canoni mensili effettivamente versati dall'utente nei 12 mesi precedenti l'evento dannoso.

---
**Fine del Documento dei Requisiti Software (DRS)**
