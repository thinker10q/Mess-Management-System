import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    // Prefer a guest mess-scoped token if one is set for the requested mess.
    // Otherwise fall back to the global admin token.
    const overrideRaw = sessionStorage.getItem("auth-override");
    let token: string | null = null;
    if (overrideRaw) {
      try {
        token = JSON.parse(overrideRaw).token as string;
      } catch {
        token = null;
      }
    }
    if (!token) token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("messes");
      localStorage.removeItem("currentMessId");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export const API_BASE = API_URL;

// ============== Types ==============
export interface User {
  id: number;
  username: string;
  full_name?: string | null;
  is_admin_global?: boolean;
}

export interface MessOut {
  id: number;
  name: string;
  code: string;
  description?: string | null;
  manager_name?: string | null;
  created_by: number;
  created_at: string;
  qr_path?: string | null;
}

export interface MessRef {
  id: number;
  name: string;
  code: string;
  description?: string | null;
  manager_name?: string | null;
  created_by: number;
  created_at: string;
  my_role: "admin" | "member";
  qr_path?: string | null;
}

export interface MessSummary {
  id: number;
  name: string;
  code: string;
  manager_name?: string | null;
  description?: string | null;
  member_count: number;
  created_at: string;
}

export interface MessEnterRequest {
  code: string;
}

export interface MessAdminLoginRequest {
  code: string;
  manager_password: string;
}

export interface MessAdminLoginResponse {
  access_token: string;
  token_type: string;
  mess: MessRef;
}

export interface MessEnterResponse {
  access_token: string;
  token_type: string;
  display_name: string;
  mess: MessRef;
}

export interface MessMemberOut {
  id: number;
  mess_id: number;
  user_id: number;
  username: string;
  full_name?: string | null;
  display_name?: string | null;
  is_guest?: boolean;
  role: "admin" | "member";
  joined_at: string;
  phone?: string | null;
  department?: string | null;
  university?: string | null;
}

export interface MessDetail extends MessOut {
  my_role: "admin" | "member";
  members: MessMemberOut[];
}

export interface MemberOut {
  id: number;
  name: string;
}

export interface ChartOut {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
  status: "active" | "archived";
  mess_id: number;
  members: MemberOut[];
}

export interface ChartView {
  chart: ChartOut;
  dates: string[];
  meals_by_member_date: Record<string, Record<string, number>>;
  totals_by_member: Record<string, number>;
  locked_dates: string[];
}

export interface MarketOut {
  id: number;
  chart_id: number;
  member_id: number;
  member_name: string;
  date: string;
  amount: number;
  description?: string | null;
}

export interface MemberBalance {
  member_id: number;
  name: string;
  meals: number;
  market_total: number;
  meal_cost: number;
  net_balance: number;
}

export interface ReportOut {
  chart: ChartOut;
  meal_rate: number;
  total_market: number;
  total_meals: number;
  balances: MemberBalance[];
}

// ============== Auth ==============
export async function login(username: string, password: string) {
  const { data } = await api.post("/api/auth/login", { username, password });
  return data as { access_token: string; token_type: string };
}

export async function register(payload: {
  username: string;
  password: string;
  full_name?: string;
}) {
  const { data } = await api.post("/api/auth/register", payload);
  return data as User;
}

export async function fetchMe() {
  const { data } = await api.get("/api/auth/me");
  return data as User;
}

// ============== Messes ==============
export async function listMesses() {
  const { data } = await api.get("/api/messes");
  return data as MessRef[];
}

export async function listAllMesses() {
  const { data } = await api.get("/api/messes/all");
  return data as MessSummary[];
}

export async function createMess(payload: {
  name: string;
  manager_name: string;
  manager_password: string;
  code: string;
  description?: string;
}) {
  // Backend now self-creates the manager User inline; returns JWT + MessRef.
  const { data } = await api.post("/api/messes", payload);
  return data as MessAdminLoginResponse;
}

export async function adminLoginMess(code: string, manager_password: string) {
  // Manager sign-in for an existing mess (code + manager password).
  const { data } = await api.post("/api/messes/admin-login", {
    code: code.toUpperCase(),
    manager_password,
  });
  return data as MessAdminLoginResponse;
}

export async function enterMess(code: string, displayName?: string) {
  // Member entry: mess code + admin-fixed name. No Guest users are created
  // when a name is given — the caller signs in AS that fixed member.
  const { data } = await api.post("/api/messes/enter", {
    code: code.toUpperCase(),
    ...(displayName?.trim() ? { display_name: displayName.trim() } : {}),
  });
  return data as MessEnterResponse;
}

export async function fetchMessNames(messId: number) {
  // Public fixed-name list for the entry form (no auth).
  const { data } = await api.get(`/api/messes/${messId}/names`);
  return data as string[];
}

export async function joinMess(code: string, manager_password: string) {
  // Legacy global-auth join route (kept for backward compatibility).
  const { data } = await api.post("/api/messes/join", {
    code: code.toUpperCase(),
    manager_password,
  });
  return data as MessRef;
}

export async function fetchMess(messId: number) {
  const { data } = await api.get(`/api/messes/${messId}`);
  return data as MessDetail;
}

export async function fetchMessMembers(messId: number) {
  const { data } = await api.get(`/api/messes/${messId}/members`);
  return data as MessMemberOut[];
}

export async function removeMessMember(messId: number, userId: number) {
  const { data } = await api.delete(`/api/messes/${messId}/members/${userId}`);
  return data;
}

export async function updateMessMember(
  messId: number,
  userId: number,
  patch: {
    display_name?: string;
    phone?: string | null;
    department?: string | null;
    university?: string | null;
  }
) {
  // PATCH /api/messes/{id}/members/{user_id} - admin-only directory edit.
  const { data } = await api.patch(
    `/api/messes/${messId}/members/${userId}`,
    patch
  );
  return data as MessMemberOut;
}

export async function regenerateMessQr(messId: number) {
  // POST /api/messes/{id}/qr-regenerate - admin-only QR rebuild.
  const { data } = await api.post(`/api/messes/${messId}/qr-regenerate`);
  return data as MessRef;
}

export async function addMessMember(
  messId: number,
  payload: {
    display_name: string;
    phone?: string | null;
    department?: string | null;
    university?: string | null;
  }
) {
  // POST /api/messes/{id}/members - admin adds a fixed member.
  const { data } = await api.post(`/api/messes/${messId}/members`, payload);
  return data as MessMemberOut;
}

export async function updateMess(
  messId: number,
  patch: {
    name?: string;
    code?: string;
    description?: string | null;
    manager_name?: string;
    manager_password?: string;
  }
) {
  // PATCH /api/messes/{id} - admin-only edit of name / code / manager / description / password.
  // Returns the updated MessRef (with my_role).
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.code !== undefined) payload.code = patch.code.toUpperCase();
  if (patch.description !== undefined) payload.description = patch.description;
  if (patch.manager_name !== undefined) payload.manager_name = patch.manager_name;
  if (patch.manager_password !== undefined) payload.manager_password = patch.manager_password;

  const { data } = await api.patch(`/api/messes/${messId}`, payload);
  return data as MessRef;
}

export async function deleteMess(messId: number) {
  // DELETE /api/messes/{id} - admin-only full delete (cascades members + charts).
  const { data } = await api.delete(`/api/messes/${messId}`);
  return data;
}

// ============== Charts ==============
export async function listCharts(messId: number) {
  const { data } = await api.get(`/api/messes/${messId}/charts`);
  return data as ChartOut[];
}

export async function fetchActiveChart(messId: number) {
  const { data } = await api.get(`/api/messes/${messId}/charts/active`);
  return data as ChartOut;
}

export async function fetchChart(messId: number, chartId: number) {
  const { data } = await api.get(`/api/messes/${messId}/charts/${chartId}`);
  return data as ChartOut;
}

export async function fetchChartView(messId: number, chartId: number) {
  const { data } = await api.get(`/api/messes/${messId}/charts/${chartId}/view`);
  return data as ChartView;
}

export async function createChart(
  messId: number,
  payload: {
    title: string;
    start_date: string;
    end_date: string;
    member_names: string[];
  }
) {
  const { data } = await api.post(`/api/messes/${messId}/charts`, payload);
  return data as ChartOut;
}

export async function updateChart(
  messId: number,
  chartId: number,
  payload: { title?: string; start_date?: string; end_date?: string; status?: string }
) {
  const { data } = await api.patch(`/api/messes/${messId}/charts/${chartId}`, payload);
  return data as ChartOut;
}

export async function deleteChart(messId: number, chartId: number) {
  const { data } = await api.delete(`/api/messes/${messId}/charts/${chartId}`);
  return data;
}

// ============== Meals ==============
export async function bulkSaveMeals(
  messId: number,
  chartId: number,
  entries: { member_id: number; date: string; meal: number }[]
) {
  const { data } = await api.post(`/api/messes/${messId}/charts/${chartId}/meals/bulk`, {
    chart_id: chartId,
    entries,
  });
  return data;
}

export async function lockDay(messId: number, chartId: number, date: string) {
  const { data } = await api.post(`/api/messes/${messId}/charts/${chartId}/meals/lock/${date}`);
  return data;
}

export async function unlockDay(messId: number, chartId: number, date: string) {
  const { data } = await api.delete(`/api/messes/${messId}/charts/${chartId}/meals/lock/${date}`);
  return data;
}

// ============== Markets ==============
export async function listMarkets(messId: number, chartId: number) {
  const { data } = await api.get(`/api/messes/${messId}/charts/${chartId}/markets`);
  return data as MarketOut[];
}

export async function createMarket(
  messId: number,
  chartId: number,
  payload: {
    chart_id: number;
    member_id: number;
    date: string;
    amount: number;
    description?: string;
  }
) {
  const { data } = await api.post(`/api/messes/${messId}/charts/${chartId}/markets`, payload);
  return data as MarketOut;
}

export async function updateMarket(
  messId: number,
  chartId: number,
  marketId: number,
  payload: { amount?: number; description?: string | null; date?: string }
) {
  const { data } = await api.patch(
    `/api/messes/${messId}/charts/${chartId}/markets/${marketId}`,
    payload
  );
  return data as MarketOut;
}

export async function deleteMarket(messId: number, chartId: number, marketId: number) {
  const { data } = await api.delete(
    `/api/messes/${messId}/charts/${chartId}/markets/${marketId}`
  );
  return data;
}

// ============== Reports ==============
export async function fetchReport(messId: number, chartId: number) {
  const { data } = await api.get(`/api/messes/${messId}/charts/${chartId}/report`);
  return data as ReportOut;
}

export function reportExcelUrl(messId: number, chartId: number) {
  return `${API_URL}/api/messes/${messId}/charts/${chartId}/report.xlsx`;
}

export function chartExcelUrl(messId: number, chartId: number) {
  return `${API_URL}/api/messes/${messId}/charts/${chartId}/report/chart.xlsx`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Authenticated downloads — the axios interceptor attaches the mess JWT,
// unlike a plain <a href> which would get a 401.
export async function downloadReportExcel(messId: number, chartId: number) {
  const res = await api.get(
    `/api/messes/${messId}/charts/${chartId}/report.xlsx`,
    { responseType: "blob" }
  );
  triggerBlobDownload(res.data as Blob, `mess-${chartId}-report.xlsx`);
}

export async function downloadChartExcel(messId: number, chartId: number) {
  const res = await api.get(
    `/api/messes/${messId}/charts/${chartId}/report/chart.xlsx`,
    { responseType: "blob" }
  );
  triggerBlobDownload(res.data as Blob, `mess-${chartId}-chart.xlsx`);
}

// ============== Helpers ==============
export function extractError(err: any, fallback = "Something went wrong"): string {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: any) => (typeof d === "string" ? d : d?.msg || JSON.stringify(d)))
      .join("; ");
  }
  if (typeof detail === "object" && detail !== null) {
    return detail.msg || JSON.stringify(detail);
  }
  return err?.message || fallback;
}