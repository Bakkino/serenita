import jwt from "jsonwebtoken";

const API_BASE = "https://api.enablebanking.com";
const APP_ID = process.env.ENABLE_BANKING_APP_ID!;

// La chiave RSA da env var Vercel (i \n literal vengono convertiti in newline reali)
function getPrivateKey(): string {
  const key = process.env.ENABLE_BANKING_PRIVATE_KEY;
  if (!key) throw new Error("ENABLE_BANKING_PRIVATE_KEY non configurata");
  return key.replace(/\\n/g, "\n");
}

// Genera un JWT firmato RS256 per autenticarsi con Enable Banking
// Durata breve (5 minuti) come richiesto dall'API
function generateJWT(): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "enablebanking.com",
    aud: "api.enablebanking.com",
    iat: now,
    exp: now + 300, // 5 minuti
  };
  return jwt.sign(payload, getPrivateKey(), {
    algorithm: "RS256",
    header: { alg: "RS256", typ: "JWT", kid: APP_ID },
  });
}

// Fetch con retry e backoff esponenziale (max 3 tentativi)
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  delay = 1000
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await fetch(url, options);

    // 429 (rate limit) o 5xx → retry
    if ((response.status === 429 || response.status >= 500) && attempt < retries) {
      await new Promise((r) => setTimeout(r, delay * attempt));
      continue;
    }

    return response;
  }

  // Non dovrebbe mai arrivare qui, ma per sicurezza
  throw new Error(`Richiesta fallita dopo ${retries} tentativi`);
}

// Headers standard per tutte le chiamate API
function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${generateJWT()}`,
    "Content-Type": "application/json",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Flusso di autorizzazione
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface StartAuthParams {
  aspspName: string;    // es. "Intesa Sanpaolo"
  aspspCountry: string; // es. "IT"
  state: string;        // CSRF protection
}

export interface StartAuthResult {
  url: string; // URL di redirect verso la banca
}

// Step 1: Inizia l'autorizzazione — ritorna l'URL dove reindirizzare l'utente
export async function startAuth(params: StartAuthParams): Promise<StartAuthResult> {
  // URL di callback — deve corrispondere ESATTAMENTE a quello registrato su Enable Banking
  const redirectUrl = "https://serenita-lime.vercel.app/api/callback";

  const response = await fetchWithRetry(`${API_BASE}/auth`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      access: {
        valid_until: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      },
      aspsp: {
        name: params.aspspName,
        country: params.aspspCountry,
      },
      state: params.state,
      redirect_url: redirectUrl,
      psu_type: "personal",
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Enable Banking auth response:", response.status, errorBody);
    throw new Error(`Enable Banking auth error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  return { url: data.url };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Conferma sessione dopo il callback
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ConfirmSessionResult {
  session_id: string;
  accounts: Array<{
    uid: string;                          // ID univoco per chiamate API
    account_id: { iban?: string; other?: any };
    name?: string;                        // Nome titolare
    currency?: string;
    cash_account_type?: string;
    identification_hash?: string;
    product?: string;
    all_account_ids?: Array<{ iban?: string }>;
  }>;
  aspsp?: { name: string; country: string };
  access?: { valid_until: string };
}

// Step 2: Conferma la sessione con il code ricevuto dal callback
export async function confirmSession(code: string): Promise<ConfirmSessionResult> {
  const response = await fetchWithRetry(`${API_BASE}/sessions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[confirmSession] error:", response.status, errorBody);
    throw new Error(`Enable Banking session error: ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  console.log("[confirmSession] RAW response keys:", Object.keys(data));
  console.log("[confirmSession] RAW response:", JSON.stringify(data).slice(0, 2000));
  return data;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Recupero saldi
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface Balance {
  balance_amount: { amount: string; currency: string };
  balance_type: string; // "InterimAvailable", "ClosingBooked", etc.
  reference_date?: string;
}

export async function getBalances(accountId: string): Promise<Balance[]> {
  const response = await fetchWithRetry(
    `${API_BASE}/accounts/${accountId}/balances`,
    { method: "GET", headers: authHeaders() }
  );

  if (!response.ok) {
    throw new Error(`Enable Banking balances error: ${response.status}`);
  }

  const data = await response.json();
  return data.balances || [];
}

// Estrae il saldo più rilevante: prima InterimAvailable, poi ClosingBooked
export function extractBestBalance(balances: Balance[]): { amount: number; currency: string } | null {
  const priority = ["InterimAvailable", "ClosingBooked", "Expected", "OpeningBooked"];

  for (const type of priority) {
    const match = balances.find((b) => b.balance_type === type);
    if (match) {
      return {
        amount: parseFloat(match.balance_amount.amount),
        currency: match.balance_amount.currency,
      };
    }
  }

  // Fallback: primo saldo disponibile
  if (balances.length > 0) {
    return {
      amount: parseFloat(balances[0].balance_amount.amount),
      currency: balances[0].balance_amount.currency,
    };
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Recupero transazioni
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RawTransaction {
  booking_date?: string;
  value_date?: string;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator: "CRDT" | "DBIT";
  creditor?: { name?: string };
  debtor?: { name?: string };
  creditor_account?: { iban?: string };
  debtor_account?: { iban?: string };
  remittance_information?: string[];
  entry_reference?: string;
  status: string; // "BOOK", "PDNG"
}

export interface TransactionsResult {
  transactions: RawTransaction[];
  continuation_key?: string;
}

// Recupera transazioni con supporto paginazione
export async function getTransactions(
  accountId: string,
  dateFrom?: string,
  dateTo?: string,
  continuationKey?: string
): Promise<TransactionsResult> {
  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  if (continuationKey) params.set("continuation_key", continuationKey);

  const url = `${API_BASE}/accounts/${accountId}/transactions${
    params.toString() ? "?" + params.toString() : ""
  }`;

  const response = await fetchWithRetry(url, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Enable Banking transactions error: ${response.status}`);
  }

  const data = await response.json();
  return {
    transactions: data.transactions || [],
    continuation_key: data.continuation_key,
  };
}

// Recupera TUTTE le transazioni seguendo la paginazione
export async function getAllTransactions(
  accountId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<RawTransaction[]> {
  const all: RawTransaction[] = [];
  let continuationKey: string | undefined;

  do {
    const result = await getTransactions(accountId, dateFrom, dateTo, continuationKey);
    all.push(...result.transactions);
    continuationKey = result.continuation_key;
  } while (continuationKey);

  return all;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper per convertire transazione API → dati per il DB
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function parseTransaction(raw: RawTransaction) {
  const isCredit = raw.credit_debit_indicator === "CRDT";
  const amount = parseFloat(raw.transaction_amount.amount);
  const counterpart = isCredit
    ? raw.debtor?.name || raw.debtor_account?.iban
    : raw.creditor?.name || raw.creditor_account?.iban;

  return {
    date: new Date(raw.booking_date || raw.value_date || new Date().toISOString()),
    amount: isCredit ? amount : -amount,
    currency: raw.transaction_amount.currency,
    description: (raw.remittance_information || []).join(" ") || counterpart || "Transazione",
    counterpart: counterpart || null,
    reference: raw.entry_reference || null,
    externalId: raw.entry_reference || null,
    status: raw.status === "PDNG" ? "PENDING" as const : "COMPLETED" as const,
  };
}
