# Serenità — Guida Setup (5 passaggi, ~15 minuti)

## Cosa ti serve prima di iniziare

- Un account **GitHub** (gratis) → github.com
- Un account **Vercel** (gratis) → vercel.com (accedi con GitHub)
- Un account **Supabase** (gratis) → supabase.com

Tutto il resto lo fa il sistema automaticamente.

---

## Passo 1 — Crea il Database (3 minuti)

1. Vai su **supabase.com** → "New Project"
2. Scegli un nome (es: "serenita") e una password per il database
   - **SALVALA**, ti serve al passo 3
3. Region: **EU Central (Frankfurt)**
4. Aspetta ~1 minuto che si crei
5. Vai in **Settings → Database** (nella sidebar)
6. Sotto "Connection string" copia:
   - **URI** (quella con `?pgbouncer=true`) → è il tuo `DATABASE_URL`
   - **Direct connection** → è il tuo `DIRECT_URL`
7. In entrambe, sostituisci `[YOUR-PASSWORD]` con la password del punto 2

---

## Passo 2 — Carica il Codice su GitHub (2 minuti)

1. Vai su **github.com** → "New repository"
2. Nome: `serenita`, privato
3. Carica tutti i file di questo progetto nel repository
   - Se sai usare git: `git init && git add . && git commit -m "init" && git remote add origin ... && git push`
   - Se no: usa il tasto "Upload files" su GitHub e trascina la cartella

---

## Passo 3 — Configura le Variabili (2 minuti)

Crea un file `.env` nella root del progetto copiando `.env.example`:

```
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"
NEXTAUTH_SECRET="genera-con-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"
```

Per generare NEXTAUTH_SECRET puoi usare: https://generate-secret.vercel.app/32

---

## Passo 4 — Deploy su Vercel (3 minuti)

1. Vai su **vercel.com** → "Add New Project"
2. Importa il tuo repository `serenita` da GitHub
3. **Prima di cliccare Deploy**, vai in "Environment Variables"
4. Aggiungi le 4 variabili dal tuo `.env`:
   - `DATABASE_URL`
   - `DIRECT_URL`  
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL` → metti `https://serenita.vercel.app` (o il dominio che Vercel ti assegna)
5. Clicca **Deploy**
6. Aspetta 2-3 minuti

---

## Passo 5 — Inizializza il Database (2 minuti)

Dopo il deploy, devi creare le tabelle e i dati iniziali.

### Opzione A: Da terminale (se hai Node.js installato)

```bash
# Clona il progetto in locale
git clone https://github.com/TUO-USERNAME/serenita.git
cd serenita

# Installa dipendenze
npm install

# Copia .env.example in .env e compila
cp .env.example .env

# Setup completo (crea tabelle + dati demo)
npm run setup
```

### Opzione B: Dalla dashboard Supabase

Se non hai Node.js, puoi usare il SQL Editor di Supabase per creare le tabelle manualmente. Chiedimi e ti genero lo script SQL.

---

## Fatto! 🎉

Vai all'URL che Vercel ti ha dato (es: `serenita.vercel.app`).

**Login:**
- Email: `paolo@wearemakers.it`
- Password: `serenita2026!`

(Cambia la password dopo il primo accesso)

---

## Come inserire i tuoi dati reali

### Import CSV (il modo più veloce)

L'app supporta import CSV per transazioni, fatture e scadenze.

**Transazioni bancarie:**
Esporta i movimenti dalla tua banca in CSV e caricali via API.

Il CSV deve avere almeno queste colonne (supporta nomi in italiano e inglese):
```
data, importo, descrizione
```

Colonne opzionali: `controparte`, `categoria`

Esempio:
```csv
data,importo,descrizione,controparte
17/02/2026,3600.00,Bonifico da TechVentures,TechVentures Srl
16/02/2026,-850.00,Canone Affitto Studio,Immobiliare Fabriano
```

**Fatture:**
```csv
numero,data,scadenza,totale,cliente,stato
FE-2026-012,10/02/2026,10/03/2026,4800.00,Marketers Srl,inviata
```

**Scadenze fiscali (dal commercialista):**
```csv
descrizione,data,importo,tipo
IVA Liquidazione Febbraio,16/03/2026,1840.00,IVA
```

### Upload via interfaccia

Nella sezione **Connettori** della dashboard, troverai il pulsante per importare CSV.

### Dal commercialista

Chiedi al tuo commercialista un export periodico (anche Excel) con:
- Scadenze fiscali prossime con importi
- Situazione debiti/rateizzazioni
- Versamenti F24 effettuati

---

## Prossimi passi (quando vorrai)

1. **Collegare le banche** → Creeremo l'integrazione con Tink/Salt Edge per sync automatica
2. **PayPal** → Collegamento diretto via API
3. **Fatture elettroniche** → Import automatico da SDI/Fatture in Cloud
4. **Notifiche** → Alert email/push per scadenze e fatture scadute
5. **App mobile** → PWA per accesso da telefono

Ogni passo è indipendente. Chiedimi quando sei pronto per il prossimo.
