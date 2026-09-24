export type Classification =
  | "possivelmente_realizada"
  | "possivelmente_pendente"
  | "revisao_manual"
  | "sem_evidencia"
  | "nao_localizada"
  | string;

export type Evidence = {
  messageId?: string;
  timestamp?: number | string | null;
  sender?: string | null;
  groupName?: string | null;
  relation?: string | null;
  text?: string | null;
  signal?: string | null;
  reason?: string | null;
};

export type AnalysisItem = {
  client?: string | null;
  sender?: string | null;
  groupName?: string | null;
  originalText?: string | null;
  date?: number | string | null;
  classification?: Classification;
  confidence?: string | null;
  evidence?: Evidence[];
  reference?: {
    rowNumber?: number | null;
    client?: string | null;
    osNumber?: string | null;
    contractId?: string | null;
    login?: string | null;
    service?: string | null;
    description?: string | null;
    date?: string | null;
  } | null;
  match?: unknown;
};

export type AnalysisResponse = {
  days?: number;
  generatedAt?: string | null;
  totalSpreadsheetOS?: number;
  totalMatched?: number;
  totalUnmatched?: number;
  summary?: Record<string, number>;
  items?: AnalysisItem[];
};

export type ImportSummary = {
  imported?: boolean;
  fileName?: string | null;
  importedAt?: string | null;
  totalOS?: number;
  preview?: Array<Record<string, unknown>>;
  fieldMap?: Record<string, string | null>;
};

export type SummaryResponse = {
  imported?: boolean;
  import?: ImportSummary;
  counts?: {
    reportsGenerated?: number;
    imported?: number;
    analyzed?: number;
    located?: number;
    notLocated?: number;
    possiblyClosed?: number;
    pending?: number;
  };
  lastAnalysis?: string | null;
};

export type GroupInfo = {
  name?: string | null;
  jid?: string | null;
  id?: string | null;
  available?: boolean;
  source?: string;
  reason?: string | null;
  size?: number | null;
  [key: string]: unknown;
};

export type GroupsResponse = {
  groups: GroupInfo[];
  source?: string;
  fetchedAt?: string;
};

export type HistoryEntry = {
  id?: string;
  fileName?: string;
  importedAt?: string | null;
  totalOS?: number;
  analyzedAt?: string | null;
  days?: number | null;
  totalAnalyzed?: number;
  totalMatched?: number;
  totalUnmatched?: number;
  possiblyClosed?: number;
  pendingOrReview?: number;
  groups?: string[];
};

export type OperationalImport = {
  id: string;
  userId?: string | null;
  userName?: string | null;
  userUsername?: string | null;
  source?: string | null;
  originalFileName?: string | null;
  storageKey?: string | null;
  sha256?: string | null;
  generatedAt?: string | null;
  generatedAtSource?: string | null;
  generatedAtConfidence?: string | null;
  importedAt?: string | null;
  rowCount?: number;
  status?: string | null;
  executionCount?: number;
  duplicate?: boolean;
};

export type OperationalGroup = { role?: string; name?: string | null; jid?: string | null };
export type OperationalExecution = {
  id: string;
  importId?: string;
  requestedByUserId?: string | null;
  userName?: string | null;
  userUsername?: string | null;
  source?: string | null;
  fileNameSnapshot?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  status?: string | null;
  rowsRead?: number;
  excludedCount?: number;
  eligibleCount?: number;
  foundCount?: number;
  reviewCount?: number;
  notFoundCount?: number;
  sentCount?: number;
  skippedCount?: number;
  failureCount?: number;
  excludedByReason?: Record<string, number>;
  errorSummary?: Record<string, unknown>;
  engineVersion?: string | null;
  groups?: OperationalGroup[];
};
export type OperationalItem = { id: string; rowNumber?: number; osNumber?: string | null; contractId?: string | null; clientName?: string | null; status?: string | null; matchScore?: number | null; matchReasons?: string[]; messageIdSource?: string | null; messageIdDestination?: string | null; failureCode?: string | null; failureMessage?: string | null; reviewRequired?: boolean };
export type OperationalReport = { id: string; type?: string; storageKey?: string; sha256?: string | null; sizeBytes?: number | null; metadata?: Record<string, unknown>; createdAt?: string };
export type OperationalImportsResponse = { items: OperationalImport[]; page: number; limit: number; total: number; totalPages: number };

export type RelatorioConfig = {
  configured?: boolean;
  origem?: { id?: string; name?: string } | null;
  destino?: { id?: string; name?: string } | null;
  registeredUsers?: number;
  webExecutionEnabled?: boolean;
  paths?: Record<string, string | null>;
};

export type HealthUnit = {
  ok?: boolean;
  detail?: string | null;
  httpStatus?: number | null;
  version?: string | null;
};

export type RelatorioStatus = {
  checkedAt?: string;
  docker?: HealthUnit;
  postgres?: HealthUnit;
  evolution?: HealthUnit;
  whatsapp?: HealthUnit & {
    connected?: boolean;
    state?: string | null;
    instance?: string | null;
  };
  listener?: HealthUnit & {
    running?: boolean;
    count?: number;
    integrated?: boolean;
    pid?: number | null;
    busy?: boolean;
  };
  config?: RelatorioConfig;
  lastReport?: {
    fileName?: string;
    modifiedAt?: string;
    size?: number;
    type?: string;
  } | null;
  reportExecution?: {
    locked?: boolean;
    startedAt?: string | null;
    fileName?: string | null;
  };
  ready?: boolean;
};

export type HealthResponse = {
  ok?: boolean;
  service?: string;
  checkedAt?: string;
  relatorio?: RelatorioStatus;
  persistence?: { ok?: boolean; configured?: boolean; database?: string | null; detail?: string };
};

export type AuthUser = {
  id: string;
  name: string;
  username: string;
  role: "MASTER_ADMIN" | "USER" | string;
  avatar?: string | null;
  active?: boolean;
  createdAt?: string;
  lastLoginAt?: string | null;
};

export type AdminUsersResponse = { users: AuthUser[] };

export type SpreadsheetInfo = {
  name: string;
  size?: number;
  modifiedAt?: string;
};
