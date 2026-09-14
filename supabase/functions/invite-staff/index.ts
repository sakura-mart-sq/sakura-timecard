import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return response({ error: "ログインが必要です。" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response({ error: "招待機能のサーバー設定が不足しています。" }, 500);
  }

  const authClient = createClient(supabaseUrl, anonKey);
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) return response({ error: "ログインを確認できません。" }, 401);

  const { data: manager, error: managerError } = await adminClient
    .from("profiles")
    .select("role, active")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (managerError || manager?.role !== "manager" || !manager.active) {
    return response({ error: "管理者権限が必要です。" }, 403);
  }

  let payload: { staffId?: string; email?: string };
  try {
    payload = await request.json();
  } catch {
    return response({ error: "入力内容を読み込めません。" }, 400);
  }
  const staffId = payload.staffId?.trim();
  const email = payload.email?.trim().toLowerCase();
  if (!staffId || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response({ error: "スタッフと有効なメールアドレスを指定してください。" }, 400);
  }

  const { data: staff, error: staffError } = await adminClient
    .from("staff")
    .select("id, active")
    .eq("id", staffId)
    .maybeSingle();
  if (staffError || !staff) return response({ error: "スタッフが見つかりません。" }, 404);
  if (!staff.active) return response({ error: "停止中のスタッフは招待できません。" }, 400);

  let authUser;
  const { data: usersData, error: usersError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) return response({ error: "既存アカウントを確認できません。" }, 500);
  authUser = usersData.users.find((user) => user.email?.toLowerCase() === email);
  let invited = false;
  if (!authUser) {
    const redirectTo = Deno.env.get("INVITE_REDIRECT_URL") || undefined;
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);
    if (inviteError || !inviteData.user) return response({ error: inviteError?.message || "招待メールを送信できませんでした。" }, 400);
    authUser = inviteData.user;
    invited = true;
  }

  const { data: linkedProfile, error: linkedError } = await adminClient
    .from("profiles")
    .select("id, staff_id, role")
    .eq("id", authUser.id)
    .maybeSingle();
  if (linkedError) return response({ error: "Authユーザーの権限情報を確認できません。" }, 500);
  if (linkedProfile && linkedProfile.role !== "staff") {
    return response({ error: "このメールアドレスはスタッフ用アカウントとして利用できません。" }, 409);
  }
  if (linkedProfile?.staff_id && linkedProfile.staff_id !== staffId) {
    return response({ error: "このメールアドレスは別のスタッフに紐付いています。" }, 409);
  }
  const { data: existingStaffProfile, error: existingStaffProfileError } = await adminClient
    .from("profiles")
    .select("id")
    .eq("staff_id", staffId)
    .maybeSingle();
  if (existingStaffProfileError) return response({ error: "スタッフの紐付け状況を確認できません。" }, 500);
  if (existingStaffProfile && existingStaffProfile.id !== authUser.id) {
    return response({ error: "このスタッフにはすでにAuthユーザーが紐付いています。" }, 409);
  }
  const { error: profileError } = await adminClient.from("profiles").upsert({
    id: authUser.id,
    role: "staff",
    staff_id: staffId,
    active: true,
  }, { onConflict: "id" });
  if (profileError) return response({ error: "スタッフアカウントを紐付けできませんでした。" }, 500);

  return response({ ok: true, invited, userId: authUser.id, staffId });
});
