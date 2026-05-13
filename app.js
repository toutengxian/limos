const ACTIVITY = {
  name: "Limos",
  poolAmount: 25000,
  endDate: "2026-09-30",
  maxParticipants: 5,
};

const STORAGE_KEY = "limos_state_v1";
const SESSION_KEY = "limos_session_v1";
const LEGACY_SESSION_KEY = "limos_current_user_id_v1";
const REMOTE_SYNC_INTERVAL_MS = 15000;
const AVATAR_SIZE_PX = 192;
const AVATAR_QUALITY = 0.78;
const APP_CONFIG = window.LIMOS_CONFIG || {};
const ADMIN_CODE_HASH = APP_CONFIG.adminCodeHash || "c2bbd6ff1f04663cf7622ac6a0597516daabd2c49f3e126869f1ee887f6aab85";
const ROLE_MEMBER = "member";
const ROLE_ADMIN = "admin";
const USER_ROLE_COMPETITOR = "competitor";
const USER_ROLE_SUPPORTER = "supporter";
const VIEW_SCOPE_ALL = "all";
const VIEW_SCOPE_COMPETITORS = "competitors";

const PARTICIPANT_COLORS = [
  "#456cf6",
  "#1f7a5c",
  "#b8872d",
  "#d84a5f",
  "#7c3aed",
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let dataStore = createDataStore(APP_CONFIG);
let state = getDefaultState();
let pendingAvatar = "";
let pendingProfileAvatar = "";
let authMode = "login";
let joinRole = USER_ROLE_COMPETITOR;
let viewScope = VIEW_SCOPE_ALL;
let toastTimer = 0;
let remoteSyncTimer = 0;

const elements = {
  onboarding: $("#onboarding"),
  mainApp: $("#main-app"),
  signupRoster: $("#signup-roster"),
  signupCount: $("#signup-count"),
  authTabs: $$("[data-auth-mode]"),
  joinRoleButtons: $$("[data-join-role]"),
  viewScopeButtons: $$("[data-view-scope]"),
  adminEntryButton: $("#admin-entry-button"),
  loginFields: $("#login-fields"),
  registerFields: $("#register-fields"),
  adminFields: $("#admin-fields"),
  loginMember: $("#login-member"),
  loginCode: $("#login-code"),
  accessCode: $("#access-code"),
  adminCode: $("#admin-code"),
  authSubmit: $("#auth-submit"),
  displayName: $("#display-name"),
  initialWeight: $("#initial-weight"),
  avatarInput: $("#avatar-input"),
  avatarPreview: $("#avatar-preview"),
  onboardingForm: $("#onboarding-form"),
  toast: $("#toast"),
  topbarAvatar: $("#topbar-avatar"),
  topbarName: $("#topbar-name"),
  topbarStatus: $("#topbar-status"),
  dashboardRank: $("#dashboard-rank"),
  dashboardRankLabel: $("#dashboard-rank-label"),
  dashboardRateLabel: $("#dashboard-rate-label"),
  dashboardRate: $("#dashboard-rate"),
  dashboardMoneyLabel: $("#dashboard-money-label"),
  dashboardMoney: $("#dashboard-money"),
  dashboardWeightDelta: $("#dashboard-weight-delta"),
  dashboardGap: $("#dashboard-gap"),
  daysLeft: $("#days-left"),
  weightForm: $("#weight-form"),
  weightInput: $("#weight-input"),
  lastEntryText: $("#last-entry-text"),
  teamActionButton: $("#team-action-button"),
  invitePanel: $("#invite-panel"),
  inviteLink: $("#invite-link"),
  copyInviteButton: $("#copy-invite-button"),
  dashboardLeaderboard: $("#dashboard-leaderboard"),
  trendCanvas: $("#trend-canvas"),
  trendLegend: $("#trend-legend"),
  activityHeatmap: $("#activity-heatmap"),
  chartRangeLabel: $("#chart-range-label"),
  winnerCard: $("#winner-card"),
  payoutList: $("#payout-list"),
  rankList: $("#rank-list"),
  profileAvatar: $("#profile-avatar"),
  profileName: $("#profile-name"),
  profileSummary: $("#profile-summary"),
  profileForm: $("#profile-form"),
  profileNameInput: $("#profile-name-input"),
  profileAvatarInput: $("#profile-avatar-input"),
  profileAvatarPreview: $("#profile-avatar-preview"),
  leaveTeamButton: $("#leave-team-button"),
  historyList: $("#history-list"),
  resetButton: $("#reset-button"),
  logoutButton: $("#logout-button"),
};

document.addEventListener("DOMContentLoaded", () => {
  init().catch((error) => {
    console.error(error);
    showToast("初始化失败，已回退到本地模式");
  });
});

async function init() {
  state = await dataStore.load();
  bindEvents();
  authMode = state.participants.length ? "login" : "register";
  renderOnboardingOptions();

  if (hasValidSession()) {
    showApp();
  } else {
    showOnboarding();
  }

  startRemoteSync();
}

function bindEvents() {
  elements.avatarInput.addEventListener("change", (event) => handleAvatarFile(event, (dataUrl) => {
    pendingAvatar = dataUrl;
    renderAvatar(elements.avatarPreview, getDraftParticipant(), "我", dataUrl);
  }));
  elements.profileAvatarInput.addEventListener("change", (event) => handleAvatarFile(event, (dataUrl) => {
    pendingProfileAvatar = dataUrl;
    renderAvatar(elements.profileAvatarPreview, getCurrentUser(), "我", dataUrl);
  }));
  elements.onboardingForm.addEventListener("submit", submitOnboarding);
  elements.weightForm.addEventListener("submit", submitWeight);
  elements.profileForm.addEventListener("submit", submitProfile);
  elements.leaveTeamButton.addEventListener("click", leaveTeam);
  elements.resetButton.addEventListener("click", logout);
  elements.logoutButton.addEventListener("click", logout);
  elements.teamActionButton.addEventListener("click", handleTeamAction);
  elements.copyInviteButton.addEventListener("click", handleCopyInviteLink);
  elements.mainApp.addEventListener("click", handleRosterActionClick);
  elements.authTabs.forEach((button) => {
    button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
  });
  elements.joinRoleButtons.forEach((button) => {
    button.addEventListener("click", () => setJoinRole(button.dataset.joinRole));
  });
  elements.viewScopeButtons.forEach((button) => {
    button.addEventListener("click", () => setViewScope(button.dataset.viewScope));
  });
  elements.adminEntryButton.addEventListener("click", () => setAuthMode("admin"));

  $$("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.nav));
  });

  window.addEventListener("resize", () => drawTrendChart(getComputed()));
}

function getDefaultState() {
  const session = loadSession();
  return {
    currentUserId: session.participantId || "",
    sessionRole: session.role || "",
    competition: {
      status: "waiting",
      startedAt: "",
      maxParticipants: ACTIVITY.maxParticipants,
    },
    participants: [],
  };
}

function loadLocalState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved?.participants)) {
      return normalizeState(saved);
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  return getDefaultState();
}

function loadSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (saved?.role === ROLE_ADMIN) {
      return { role: ROLE_ADMIN, participantId: "" };
    }
    if (saved?.role === ROLE_MEMBER && saved.participantId) {
      return { role: ROLE_MEMBER, participantId: saved.participantId };
    }
  } catch {
    localStorage.removeItem(SESSION_KEY);
  }

  const legacyParticipantId = localStorage.getItem(LEGACY_SESSION_KEY);
  if (legacyParticipantId) {
    return { role: ROLE_MEMBER, participantId: legacyParticipantId };
  }

  return { role: "", participantId: "" };
}

function saveSession(nextSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
  localStorage.removeItem(LEGACY_SESSION_KEY);
  state.currentUserId = nextSession.participantId || "";
  state.sessionRole = nextSession.role || "";
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LEGACY_SESSION_KEY);
  state.currentUserId = "";
  state.sessionRole = "";
}

function saveState() {
  return dataStore.save(state).catch((error) => {
    console.error(error);
    showToast("保存失败，已保留本地副本");
    throw error;
  });
}

function saveLocalState(nextState) {
  const localState = normalizeState(nextState);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(localState));
}

function normalizeState(nextState) {
  const fallback = getDefaultState();
  const session = loadSession();
  const participants = Array.isArray(nextState?.participants)
    ? nextState.participants.map(normalizeParticipant)
    : [];
  const competitorCount = participants.filter(isCompetitor).length;
  const status = competitorCount >= ACTIVITY.maxParticipants ? "active" : "waiting";
  const startedAt = status === "active"
    ? nextState?.competition?.startedAt || getTodayISO()
    : "";
  return {
    currentUserId: session.participantId || "",
    sessionRole: session.role || "",
    competition: {
      ...fallback.competition,
      ...nextState?.competition,
      status,
      startedAt,
      maxParticipants: ACTIVITY.maxParticipants,
    },
    participants,
  };
}

function normalizeParticipant(participant, index = 0) {
  return {
    id: participant.id || createParticipantId(),
    name: String(participant.name || "").trim(),
    color: participant.color || PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length],
    initialWeight: Number(participant.initialWeight) || 0,
    avatar: participant.avatar || "",
    userRole: normalizeUserRole(participant.userRole || participant.role),
    accessCodeHash: participant.accessCodeHash || "",
    joinedAt: participant.joinedAt || new Date().toISOString(),
    entries: Array.isArray(participant.entries) ? participant.entries : [],
  };
}

function normalizeUserRole(role) {
  return role === USER_ROLE_SUPPORTER ? USER_ROLE_SUPPORTER : USER_ROLE_COMPETITOR;
}

function isCompetitor(participant) {
  return normalizeUserRole(participant?.userRole || participant?.role) === USER_ROLE_COMPETITOR;
}

function isSupporter(participant) {
  return normalizeUserRole(participant?.userRole || participant?.role) === USER_ROLE_SUPPORTER;
}

function getCompetitors() {
  return state.participants.filter(isCompetitor);
}

function getSupporters() {
  return state.participants.filter(isSupporter);
}

function createDataStore(config) {
  if (config.storageMode === "api") {
    return createApiStore(config);
  }

  return {
    type: "local",
    async load() {
      return loadLocalState();
    },
    async save(nextState) {
      saveLocalState(nextState);
    },
  };
}

function createApiStore(config) {
  const endpoint = config.apiEndpoint || "/api/state";

  async function requestState(options = {}) {
    const response = await fetch(endpoint, {
      cache: "no-store",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`State API failed: ${response.status}`);
    }

    return response.json();
  }

  return {
    type: "api",
    async load() {
      try {
        const data = await requestState();
        if (data?.payload) {
          const remoteState = normalizeState(data.payload);
          saveLocalState(remoteState);
          return remoteState;
        }
      } catch (error) {
        console.error(error);
      }

      return loadLocalState();
    },
    async save(nextState) {
      const nextLocalState = normalizeState(nextState);
      saveLocalState(nextLocalState);

      const payload = {
        competition: nextLocalState.competition,
        participants: nextLocalState.participants,
      };
      await requestState({
        method: "PUT",
        body: JSON.stringify({ payload }),
      });
    },
  };
}

function startRemoteSync() {
  if (dataStore.type !== "api" || remoteSyncTimer) return;

  remoteSyncTimer = window.setInterval(async () => {
    const session = loadSession();
    const remoteState = await dataStore.load();
    state = {
      ...remoteState,
      currentUserId: session.participantId || "",
      sessionRole: session.role || "",
    };
    saveLocalState(state);
    renderOnboardingOptions();
    if (!elements.mainApp.classList.contains("hidden")) {
      renderAll();
    }
  }, REMOTE_SYNC_INTERVAL_MS);
}

function showOnboarding() {
  elements.onboarding.classList.add("screen-active");
  elements.mainApp.classList.add("hidden");
  hydrateOnboardingForm();
}

function showApp() {
  elements.onboarding.classList.remove("screen-active");
  elements.mainApp.classList.remove("hidden");
  navigate("dashboard");
  renderAll();
}

function renderOnboardingOptions() {
  const competitors = getCompetitors();
  const supporters = getSupporters();
  const filled = competitors.length;
  const remaining = ACTIVITY.maxParticipants - filled;
  elements.signupCount.textContent = remaining > 0 ? `还差 ${remaining} 位参赛开局` : "参赛席位已满";
  elements.signupRoster.innerHTML = Array.from({ length: ACTIVITY.maxParticipants }, (_, index) => {
    const participant = competitors[index];
    if (participant) {
      return `<span class="roster-seat is-filled">${avatarHtml(participant, "roster-avatar")}</span>`;
    }
    return `<span class="roster-seat is-empty" aria-label="空席位"><span class="avatar roster-avatar empty-avatar">${index + 1}</span></span>`;
  }).join("");

  elements.loginMember.innerHTML = state.participants.length
    ? state.participants.map((participant) => `<option value="${escapeHtml(participant.id)}">${escapeHtml(participant.name)} · ${getRoleLabel(participant)}</option>`).join("")
    : `<option value="">还没有成员</option>`;
  elements.loginMember.disabled = !state.participants.length;

  const loginTab = elements.authTabs.find((button) => button.dataset.authMode === "login");
  if (loginTab) {
    loginTab.disabled = !state.participants.length;
  }

  const registerTab = elements.authTabs.find((button) => button.dataset.authMode === "register");
  if (registerTab) {
    registerTab.disabled = false;
  }

  elements.joinRoleButtons.forEach((button) => {
    const isCompetitorRole = button.dataset.joinRole === USER_ROLE_COMPETITOR;
    button.disabled = isCompetitorRole && competitors.length >= ACTIVITY.maxParticipants;
  });

  if (joinRole === USER_ROLE_COMPETITOR && competitors.length >= ACTIVITY.maxParticipants) {
    joinRole = USER_ROLE_SUPPORTER;
  }
  applyJoinRole();

  if (authMode === "login" && !state.participants.length) {
    authMode = "register";
  }
  elements.signupCount.title = supporters.length ? `${supporters.length} 位陪伴用户已加入` : "";
  applyAuthMode();
}

function hydrateOnboardingForm() {
  pendingAvatar = "";
  elements.displayName.value = "";
  elements.initialWeight.value = "";
  elements.accessCode.value = "";
  elements.loginCode.value = "";
  elements.adminCode.value = "";
  renderAvatar(elements.avatarPreview, getDraftParticipant(), "我", "");
  renderOnboardingOptions();
}

function setAuthMode(mode) {
  authMode = mode;
  applyAuthMode();
}

function setJoinRole(role) {
  joinRole = normalizeUserRole(role);
  applyJoinRole();
}

function applyJoinRole() {
  elements.joinRoleButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.joinRole === joinRole);
  });
}

function setViewScope(scope) {
  viewScope = scope === VIEW_SCOPE_COMPETITORS ? VIEW_SCOPE_COMPETITORS : VIEW_SCOPE_ALL;
  renderAll();
}

function applyViewScope() {
  elements.viewScopeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewScope === viewScope);
  });
}

function applyAuthMode() {
  elements.authTabs.forEach((button) => {
    button.classList.toggle("auth-tab-active", button.dataset.authMode === authMode);
  });
  elements.loginFields.classList.toggle("hidden", authMode !== "login");
  elements.registerFields.classList.toggle("hidden", authMode !== "register");
  elements.adminFields.classList.toggle("hidden", authMode !== "admin");
  elements.adminEntryButton.classList.toggle("hidden", authMode === "admin");
  elements.authSubmit.textContent = authMode === "register" ? "加入" : authMode === "admin" ? "管理员登录" : "登录";
}

async function submitOnboarding(event) {
  event.preventDefault();
  if (authMode === "login") {
    await loginMember();
    return;
  }
  if (authMode === "admin") {
    await loginAdmin();
    return;
  }

  const userRole = joinRole;
  if (userRole === USER_ROLE_COMPETITOR && getCompetitors().length >= ACTIVITY.maxParticipants) {
    showToast("参赛席位已满，可以选择陪伴加入");
    return;
  }

  const name = elements.displayName.value.trim();
  const initialWeight = Number(elements.initialWeight.value);
  const accessCode = elements.accessCode.value.trim();

  if (!name || !isValidWeight(initialWeight)) {
    showToast("填好昵称和初始体重");
    return;
  }

  if (!isValidAccessCode(accessCode)) {
    showToast("登录码需要 6-20 个字符");
    return;
  }

  if (state.participants.some((participant) => participant.name === name)) {
    showToast("这个昵称已经有人用了");
    return;
  }

  if (!pendingAvatar) {
    showToast("先放一张头像");
    return;
  }

  const accessCodeHash = await createAccessCodeHash(accessCode);
  if (!accessCodeHash) return;

  const previousParticipants = state.participants.map((item) => ({
    ...item,
    entries: item.entries.map((entry) => ({ ...entry })),
  }));
  const previousCompetition = { ...state.competition };
  const participant = {
    id: createParticipantId(),
    name,
    color: PARTICIPANT_COLORS[state.participants.length % PARTICIPANT_COLORS.length],
    initialWeight: round1(initialWeight),
    avatar: pendingAvatar,
    userRole,
    accessCodeHash,
    joinedAt: new Date().toISOString(),
    entries: [],
  };
  state.participants.push(participant);
  maybeStartCompetition();
  saveSession({ role: ROLE_MEMBER, participantId: participant.id });
  try {
    await saveState();
  } catch {
    state.participants = previousParticipants;
    state.competition = previousCompetition;
    clearSession();
    return;
  }

  pendingAvatar = "";
  showApp();
  showToast(userRole === USER_ROLE_SUPPORTER ? "已加入陪伴席" : isCompetitionActive() ? "5 位参赛到齐，小瘦包开局" : "已占参赛席，等大家上车");
}

async function loginMember() {
  const participant = state.participants.find((item) => item.id === elements.loginMember.value);
  const accessCode = elements.loginCode.value.trim();
  if (!participant) {
    showToast("先完成首次入队");
    return;
  }
  if (!participant.accessCodeHash) {
    showToast("这个成员还没有登录码");
    return;
  }
  if (!isValidAccessCode(accessCode) || !await verifyAccessCode(accessCode, participant.accessCodeHash)) {
    showToast("登录码不对");
    return;
  }

  saveSession({ role: ROLE_MEMBER, participantId: participant.id });
  showApp();
  showToast(`${participant.name} 已登录`);
}

async function loginAdmin() {
  const adminCode = elements.adminCode.value.trim();
  if (!adminCode || !await verifyAccessCode(adminCode, ADMIN_CODE_HASH)) {
    showToast("管理员码不对");
    return;
  }

  saveSession({ role: ROLE_ADMIN, participantId: "" });
  showApp();
  showToast("管理员已登录");
}

function maybeStartCompetition() {
  if (getCompetitors().length < ACTIVITY.maxParticipants || isCompetitionActive()) return;

  const startedAt = getTodayISO();
  state.competition = {
    status: "active",
    startedAt,
    maxParticipants: ACTIVITY.maxParticipants,
  };
  getCompetitors().forEach((participant) => {
    if (!participant.entries.some((entry) => entry.date === startedAt)) {
      participant.entries.push({
        date: startedAt,
        weight: participant.initialWeight,
        createdAt: new Date().toISOString(),
        type: "start",
      });
    }
  });
}

function isCompetitionActive() {
  return state.competition?.status === "active" && getCompetitors().length >= ACTIVITY.maxParticipants;
}

function getDraftParticipant() {
  return {
    id: "draft",
    name: elements.displayName?.value || "我",
    color: PARTICIPANT_COLORS[state.participants.length % PARTICIPANT_COLORS.length],
    initialWeight: 0,
    avatar: pendingAvatar,
    userRole: joinRole,
    entries: [],
  };
}

async function submitWeight(event) {
  event.preventDefault();
  if (!isMemberSession()) {
    showToast("管理员不能记录体重");
    return;
  }
  const participant = getCurrentUser();
  const weight = Number(elements.weightInput.value);

  if (!isCompetitionActive() && isCompetitor(participant)) {
    showToast("5 位参赛到齐后再上秤");
    return;
  }

  if (!participant || !isValidWeight(weight)) {
    showToast("输入 30 到 250 kg 之间的体重");
    return;
  }

  const previousEntries = participant.entries.map((entry) => ({ ...entry }));
  upsertEntry(participant, getTodayISO(), round1(weight));
  try {
    await saveState();
  } catch {
    participant.entries = previousEntries;
    renderAll();
    return;
  }

  elements.weightInput.value = "";
  renderAll();
  showToast("今天的上秤已更新");
}

async function submitProfile(event) {
  event.preventDefault();
  if (!isMemberSession()) {
    showToast("管理员不能修改资料");
    return;
  }
  const participant = getCurrentUser();
  const name = elements.profileNameInput.value.trim();

  if (!participant || !name) {
    showToast("昵称不能为空");
    return;
  }

  const previousName = participant.name;
  const previousAvatar = participant.avatar;
  participant.name = name;
  if (pendingProfileAvatar) {
    participant.avatar = pendingProfileAvatar;
  }
  try {
    await saveState();
  } catch {
    participant.name = previousName;
    participant.avatar = previousAvatar;
    renderAll();
    return;
  }

  pendingProfileAvatar = "";
  renderAll();
  showToast("资料已更新");
}

async function logout() {
  clearSession();
  state = await dataStore.load();
  pendingAvatar = "";
  pendingProfileAvatar = "";
  authMode = state.participants.length ? "login" : "register";
  renderOnboardingOptions();
  showOnboarding();
  showToast("已退出登录");
}

async function leaveTeam() {
  if (!isMemberSession()) {
    showToast("只有成员本人可以退出小队");
    return;
  }
  if (isCompetitionActive()) {
    showToast("小队已开局，不能退出");
    return;
  }

  const participant = getCurrentUser();
  const shouldLeave = window.confirm(`确定退出小队吗？${participant.name} 的资料会从小队中移除。`);
  if (!shouldLeave) return;

  const previousParticipants = state.participants;
  const previousCompetition = state.competition;
  removeParticipantFromState(participant.id);
  clearSession();
  try {
    await saveState();
  } catch {
    state.participants = previousParticipants;
    state.competition = previousCompetition;
    saveSession({ role: ROLE_MEMBER, participantId: participant.id });
    renderAll();
    return;
  }

  pendingAvatar = "";
  pendingProfileAvatar = "";
  authMode = state.participants.length ? "login" : "register";
  renderOnboardingOptions();
  showOnboarding();
  showToast("已退出小队");
}

async function handleRosterActionClick(event) {
  const removeButton = event.target.closest("[data-remove-participant]");
  if (!removeButton) return;

  await removeParticipantAsAdmin(removeButton.dataset.removeParticipant);
}

async function removeParticipantAsAdmin(participantId) {
  if (!isAdminSession()) {
    showToast("只有管理员可以移除成员");
    return;
  }
  if (isCompetitionActive()) {
    showToast("小队已开局，不能移除成员");
    return;
  }

  const participant = state.participants.find((item) => item.id === participantId);
  if (!participant) {
    showToast("成员不存在");
    return;
  }

  const shouldRemove = window.confirm(`确定移除 ${participant.name} 吗？这会删除 TA 的头像、初始体重和登录码。`);
  if (!shouldRemove) return;

  const previousParticipants = state.participants;
  const previousCompetition = state.competition;
  removeParticipantFromState(participant.id);
  try {
    await saveState();
  } catch {
    state.participants = previousParticipants;
    state.competition = previousCompetition;
    renderAll();
    return;
  }

  renderOnboardingOptions();
  renderAll();
  showToast(`${participant.name} 已移除`);
}

function removeParticipantFromState(participantId) {
  state.participants = state.participants.filter((participant) => participant.id !== participantId);
  if (getCompetitors().length < ACTIVITY.maxParticipants) {
    state.competition = {
      status: "waiting",
      startedAt: "",
      maxParticipants: ACTIVITY.maxParticipants,
    };
  }
}

function renderAll() {
  if (!hasValidSession()) {
    showOnboarding();
    return;
  }
  const computed = getComputed();
  applyViewScope();
  renderTopbar(computed);
  renderDashboard(computed);
  renderTrend(computed);
  renderRankPage(computed);
  renderProfile(computed);
}

function renderTopbar(computed) {
  if (isAdminSession()) {
    renderAvatar(elements.topbarAvatar, getAdminProfile(), "管");
    elements.topbarName.textContent = "管理员";
    elements.topbarStatus.textContent = isCompetitionActive()
      ? `管理模式 · ${computed.competitorResults.length} 参赛 · ${getSupporters().length} 陪伴`
      : `管理模式 · 参赛 ${getCompetitors().length}/${ACTIVITY.maxParticipants}`;
    return;
  }

  const current = getCurrentUser();
  const result = computed.allResults.find((item) => item.id === current.id);
  renderAvatar(elements.topbarAvatar, current);
  elements.topbarName.textContent = current.name;
  elements.topbarStatus.textContent = isCompetitionActive()
    ? `${getRoleLabel(current)} · ${getRankText(result)} · ${formatRate(result.lossRate)}`
    : `${getRoleLabel(current)} · 参赛 ${getCompetitors().length}/${ACTIVITY.maxParticipants}`;
}

function renderDashboard(computed) {
  if (isAdminSession()) {
    renderAdminDashboard(computed);
    return;
  }

  const current = getCurrentUser();
  const result = computed.allResults.find((item) => item.id === current.id);
  const payout = computed.payouts[current.id];
  elements.dashboardRateLabel.textContent = "当前瘦身率";
  elements.dashboardRankLabel.textContent = isCompetitor(current) ? "参赛排位" : "陪伴排位";

  if (!isCompetitionActive()) {
    const remaining = ACTIVITY.maxParticipants - getCompetitors().length;
    setTeamAction("share");
    elements.daysLeft.textContent = "小队集结中";
    elements.dashboardRank.textContent = `${getCompetitors().length}/${ACTIVITY.maxParticipants}`;
    elements.dashboardRate.textContent = isSupporter(current) ? formatRate(result.lossRate) : "--";
    elements.dashboardRate.classList.toggle("gain", isSupporter(current) && result.lossRate < 0);
    elements.dashboardRate.classList.toggle("loss", isSupporter(current) && result.lossRate >= 0);
    elements.dashboardMoneyLabel.textContent = "还差";
    elements.dashboardMoney.textContent = `${remaining} 位`;
    elements.dashboardWeightDelta.textContent = isSupporter(current)
      ? `${formatSignedKg(result.deltaKg)} · 陪伴记录不参与结算`
      : `初始 ${formatNumber(current.initialWeight, 1)}kg 已锁定`;
    elements.dashboardGap.textContent = "5 位参赛成员坐满自动开局";
    elements.weightForm.classList.toggle("hidden", isCompetitor(current));
    const latest = getLatestEntry(current);
    elements.lastEntryText.textContent = latest
      ? `上次 ${formatDateShort(latest.date)} · ${formatNumber(latest.weight, 1)}kg`
      : "陪伴用户可以先记录体重";
    elements.dashboardLeaderboard.innerHTML = waitingListHtml();
    return;
  }

  setTeamAction("rank");
  elements.weightForm.classList.remove("hidden");

  elements.daysLeft.textContent = `剩余 ${daysBetween(getTodayISO(), ACTIVITY.endDate)} 天`;
  elements.dashboardRank.textContent = isCompetitor(current) ? result.competitionRank : result.allRank;
  elements.dashboardRate.textContent = formatRate(result.lossRate);
  elements.dashboardRate.classList.toggle("gain", result.lossRate < 0);
  elements.dashboardRate.classList.toggle("loss", result.lossRate >= 0);
  elements.dashboardWeightDelta.textContent = `${formatSignedKg(result.deltaKg)} · 当前 ${formatNumber(result.currentWeight, 1)}kg`;
  elements.dashboardGap.textContent = isSupporter(current)
    ? "陪伴用户不参与奖金结算"
    : result.isLeader
    ? computed.leaders.length > 1 ? "并列领跑，等下一次破局" : "你在领跑"
    : `落后第一名 ${formatNumber(result.gapToLeader, 2)} 个百分点`;

  if (isSupporter(current)) {
    elements.dashboardMoneyLabel.textContent = "结算身份";
    elements.dashboardMoney.textContent = "陪伴";
  } else if (payout.status === "win") {
    elements.dashboardMoneyLabel.textContent = computed.leaders.length > 1 ? "并列领跑试算" : "今日可收";
    elements.dashboardMoney.textContent = `¥${formatMoney(payout.prize)}`;
  } else {
    elements.dashboardMoneyLabel.textContent = "今日应付";
    elements.dashboardMoney.textContent = `¥${formatMoney(payout.pay)}`;
  }

  const latest = getLatestEntry(current);
  elements.lastEntryText.textContent = latest
    ? `上次 ${formatDateShort(latest.date)} · ${formatNumber(latest.weight, 1)}kg`
    : "还没有上秤记录";

  elements.dashboardLeaderboard.innerHTML = computed.displayResults.slice(0, 5).map((item) => rankRowHtml(item, computed, true)).join("");
}

function renderAdminDashboard(computed) {
  elements.weightForm.classList.add("hidden");
  elements.dashboardRateLabel.textContent = isCompetitionActive() ? "当前领跑" : "小队状态";
  elements.dashboardRankLabel.textContent = "参赛席位";
  elements.dashboardRank.textContent = `${getCompetitors().length}/${ACTIVITY.maxParticipants}`;

  if (!isCompetitionActive()) {
    const remaining = ACTIVITY.maxParticipants - getCompetitors().length;
    setTeamAction("share");
    elements.daysLeft.textContent = "小队集结中";
    elements.dashboardRate.textContent = "--";
    elements.dashboardRate.classList.remove("gain", "loss");
    elements.dashboardMoneyLabel.textContent = "还差";
    elements.dashboardMoney.textContent = `${remaining} 位`;
    elements.dashboardWeightDelta.textContent = "管理员不参与比赛";
    elements.dashboardGap.textContent = "参赛成员到齐后自动开局";
    elements.dashboardLeaderboard.innerHTML = waitingListHtml();
    return;
  }

  setTeamAction("rank");
  const leader = computed.leaders[0];
  elements.daysLeft.textContent = `剩余 ${daysBetween(getTodayISO(), ACTIVITY.endDate)} 天`;
  elements.dashboardRate.textContent = formatRate(leader.lossRate);
  elements.dashboardRate.classList.toggle("gain", leader.lossRate < 0);
  elements.dashboardRate.classList.toggle("loss", leader.lossRate >= 0);
  elements.dashboardMoneyLabel.textContent = computed.leaders.length > 1 ? "并列领跑试算" : "预计赢家可收";
  elements.dashboardMoney.textContent = `¥${formatMoney(computed.payouts[leader.id].prize)}`;
  elements.dashboardWeightDelta.textContent = `当前领跑：${computed.leaders.map((item) => item.name).join("、")}`;
  elements.dashboardGap.textContent = "只读模式，不能记录体重";
  elements.dashboardLeaderboard.innerHTML = computed.displayResults.slice(0, 5).map((item) => rankRowHtml(item, computed, true)).join("");
}

function renderTrend(computed) {
  if (!isCompetitionActive()) {
    elements.chartRangeLabel.textContent = "小队集结中";
    drawTrendChart(computed);
    elements.trendLegend.innerHTML = waitingListHtml();
    renderHeatmap(computed);
    return;
  }

  const timeline = getTimeline();
  elements.chartRangeLabel.textContent = timeline.length > 2
    ? `${timeline[1].label} 至 ${timeline.at(-1).label}`
    : "起始至今日";
  drawTrendChart(computed);
  elements.trendLegend.innerHTML = computed.displayResults
    .map((item) => {
      const payout = computed.payouts[item.id];
      const moneyText = isSupporter(item)
        ? "陪伴不结算"
        : payout.status === "win" ? `预计得 ¥${formatMoney(payout.prize)}` : `预计付 ¥${formatMoney(payout.pay)}`;
      return `
        <div class="legend-row ${item.id === state.currentUserId ? "is-me" : ""}">
          <div class="legend-left">
            <span class="color-dot" style="background:${item.color}"></span>
            ${avatarHtml(item, "avatar-sm")}
            <div>
              <p class="rank-name">${escapeHtml(item.name)}${roleBadgeHtml(item)}</p>
              <p class="rank-sub">${formatSignedKg(item.deltaKg)} · ${moneyText}</p>
            </div>
          </div>
          <strong class="${item.lossRate < 0 ? "gain" : "loss"}">${formatRate(item.lossRate)}</strong>
        </div>
      `;
    })
    .join("");
  renderHeatmap(computed);
}

function renderRankPage(computed) {
  if (!isCompetitionActive()) {
    elements.winnerCard.innerHTML = `
      <div class="winner-title">
        <span>组队中</span>
        <strong>${getCompetitors().length}/${ACTIVITY.maxParticipants}</strong>
      </div>
      <h2>小瘦包还在组队</h2>
      <p class="muted">第 5 位参赛成员入队后，系统会锁定初始体重并自动开局。陪伴用户可以提前加入，但不占参赛席。</p>
    `;
    elements.payoutList.innerHTML = "";
    elements.rankList.innerHTML = waitingListHtml();
    return;
  }

  const leaderNames = computed.leaders.map((item) => item.name).join("、");
  const leaderRate = computed.leaders[0]?.lossRate ?? 0;
  elements.winnerCard.innerHTML = `
    <div class="winner-title">
      <span>${computed.leaders.length > 1 ? "并列领跑" : "当前领跑"}</span>
      <strong>${formatRate(leaderRate)}</strong>
    </div>
    <h2>${escapeHtml(leaderNames)}</h2>
    <p class="muted">${computed.leaders.length > 1 ? "今天如果收官，领跑者暂按平分奖池试算。" : "今天如果收官，领跑者拿走全部奖池。"}</p>
  `;

  elements.payoutList.innerHTML = computed.competitorResults
    .map((item) => {
      const payout = computed.payouts[item.id];
      const isWin = payout.status === "win";
      return `
        <div class="payout-row ${isWin ? "pay-win" : ""}">
          <div>
            <p><strong class="rank-name">${escapeHtml(item.name)}${roleBadgeHtml(item)}</strong></p>
            <p class="pay-sub">${isWin ? "今日可收" : `落后 ${formatNumber(item.gapToLeader, 2)} 个百分点`}</p>
          </div>
          <strong>${isWin ? "+" : "-"}¥${formatMoney(isWin ? payout.prize : payout.pay)}</strong>
        </div>
      `;
    })
    .join("");

  elements.rankList.innerHTML = computed.displayResults.map((item) => rankRowHtml(item, computed, false)).join("");
}

function renderProfile(computed) {
  if (isAdminSession()) {
    const adminProfile = getAdminProfile();
    renderAvatar(elements.profileAvatar, adminProfile, "管");
    elements.profileName.textContent = "管理员";
    elements.profileSummary.textContent = isCompetitionActive()
      ? `管理模式 · ${computed.competitorResults.length} 位参赛 · 剩余 ${daysBetween(getTodayISO(), ACTIVITY.endDate)} 天`
      : `管理模式 · 还差 ${ACTIVITY.maxParticipants - getCompetitors().length} 位参赛开局`;
    elements.profileForm.classList.add("hidden");
    elements.historyList.innerHTML = `<p class="muted">管理员不能记录体重，只负责查看和维护成员。</p>`;
    return;
  }

  elements.profileForm.classList.remove("hidden");
  const current = getCurrentUser();
  const result = computed.allResults.find((item) => item.id === current.id);
  elements.leaveTeamButton.classList.toggle("hidden", isCompetitionActive());
  renderAvatar(elements.profileAvatar, current);
  elements.profileName.textContent = current.name;
  elements.profileSummary.textContent = isCompetitionActive()
    ? `${getRoleLabel(current)} · 初始 ${formatNumber(current.initialWeight, 1)}kg · 当前 ${formatNumber(result.currentWeight, 1)}kg · ${formatRate(result.lossRate)}`
    : `${getRoleLabel(current)} · 初始 ${formatNumber(current.initialWeight, 1)}kg · 还差 ${ACTIVITY.maxParticipants - getCompetitors().length} 位参赛开局`;
  elements.profileNameInput.value = current.name;
  renderAvatar(elements.profileAvatarPreview, current);

  const entries = [...current.entries].sort((a, b) => b.date.localeCompare(a.date));
  elements.historyList.innerHTML = entries.length
    ? entries.map((entry) => {
        const rate = calculateLossRate(current.initialWeight, entry.weight);
        return `
          <div class="history-row">
            <div>
              <strong>${formatDateShort(entry.date)}</strong>
              <p class="rank-sub">相对初始 ${formatRate(rate)}</p>
            </div>
            <strong>${formatNumber(entry.weight, 1)}kg</strong>
          </div>
        `;
      }).join("")
    : `<p class="muted">开局后，这里会记录每次上秤。</p>`;
}

function setTeamAction(action) {
  elements.teamActionButton.dataset.action = action;
  elements.teamActionButton.textContent = action === "share" ? "邀请成员" : "看结算";
  elements.inviteLink.value = getInviteUrl();
  if (action === "rank") {
    elements.invitePanel.classList.add("hidden");
  }
}

async function handleTeamAction() {
  if (elements.teamActionButton.dataset.action === "rank") {
    navigate("rank");
    return;
  }

  await shareInviteLink();
}

async function shareInviteLink() {
  const inviteUrl = getInviteUrl();
  const shareData = {
    title: "Limos 小瘦包",
    text: "来加入小瘦包，5 人满员后自动开局。",
    url: inviteUrl,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  const copied = await copyText(inviteUrl);
  if (copied) {
    showToast("邀请链接已复制");
    return;
  }

  showInvitePanel();
  showToast("链接已显示，可长按复制");
}

async function handleCopyInviteLink() {
  const inviteUrl = getInviteUrl();
  elements.inviteLink.value = inviteUrl;
  const copied = await copyText(inviteUrl);
  if (copied) {
    showToast("邀请链接已复制");
    return;
  }

  elements.inviteLink.focus();
  elements.inviteLink.select();
  showToast("已选中链接，可手动复制");
}

function showInvitePanel() {
  elements.inviteLink.value = getInviteUrl();
  elements.invitePanel.classList.remove("hidden");
}

function getInviteUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to the textarea fallback.
    }
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  input.remove();
  return copied;
}

function navigate(page) {
  $$(".page").forEach((element) => element.classList.remove("page-active"));
  $(`#page-${page}`).classList.add("page-active");

  $$(".nav-button").forEach((button) => {
    button.classList.toggle("nav-active", button.dataset.nav === page);
  });

  window.scrollTo({ top: 0, behavior: "instant" });
  if (page === "trend") {
    requestAnimationFrame(() => drawTrendChart(getComputed()));
  }
}

function getComputed() {
  const base = state.participants.map((participant) => {
    const currentWeight = getCurrentWeight(participant);
    const deltaKg = round1(participant.initialWeight - currentWeight);
    const lossRate = calculateLossRate(participant.initialWeight, currentWeight);
    return {
      ...participant,
      currentWeight,
      deltaKg,
      lossRate,
    };
  });

  const allResults = sortResults(base);
  const competitorResults = sortResults(base.filter(isCompetitor));

  allResults.forEach((item, index) => {
    item.allRank = index + 1;
  });
  competitorResults.forEach((item, index) => {
    item.competitionRank = index + 1;
  });

  const leaderRate = competitorResults[0]?.lossRate ?? 0;
  const leaders = competitorResults.filter((item) => nearlyEqual(item.lossRate, leaderRate));
  competitorResults.forEach((item) => {
    item.isLeader = leaders.some((leader) => leader.id === item.id);
    item.gapToLeader = round2(Math.max(0, leaderRate - item.lossRate));
  });
  allResults.forEach((item) => {
    if (!isCompetitor(item)) {
      item.isLeader = false;
      item.gapToLeader = 0;
    }
  });

  return {
    allResults,
    competitorResults,
    displayResults: viewScope === VIEW_SCOPE_COMPETITORS ? competitorResults : allResults,
    leaders,
    payouts: computePayouts(competitorResults, leaders),
  };
}

function sortResults(results) {
  return [...results].sort((a, b) => {
    if (b.lossRate !== a.lossRate) return b.lossRate - a.lossRate;
    return b.deltaKg - a.deltaKg;
  });
}

function getRankNumber(item) {
  return viewScope === VIEW_SCOPE_COMPETITORS ? item.competitionRank || "--" : item.allRank || "--";
}

function getRankText(item) {
  if (isCompetitor(item)) return `参赛 #${item.competitionRank || "--"}`;
  return `全部 #${item.allRank || "--"}`;
}

function getRoleLabel(participant) {
  return isSupporter(participant) ? "陪伴" : "参赛";
}

function roleBadgeHtml(participant) {
  const supporter = isSupporter(participant);
  return `<span class="role-badge ${supporter ? "supporter" : "competitor"}">${supporter ? "陪伴" : "参赛"}</span>`;
}

function rankIndexHtml(item) {
  const crownHtml = item.isLeader
    ? `
        <svg class="rank-crown" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 17h14l1-9-5 4-3-6-3 6-5-4 1 9Z" />
          <path d="M6.5 20h11" />
        </svg>
      `
    : "";
  return `<span class="rank-index">${crownHtml}<span>${getRankNumber(item)}</span></span>`;
}

function waitingListHtml() {
  const competitors = getCompetitors();
  const supporters = viewScope === VIEW_SCOPE_COMPETITORS ? [] : getSupporters();
  const slots = Array.from({ length: ACTIVITY.maxParticipants }, (_, index) => competitors[index] || null);
  const competitorRows = slots.map((participant, index) => {
    if (!participant) {
      return `
        <div class="rank-row waiting-slot">
          <div class="rank-left">
            <span class="rank-index">${index + 1}</span>
            <span class="avatar avatar-sm empty-avatar">+</span>
            <div>
              <p class="rank-name">空席位</p>
              <p class="rank-sub">等待参赛成员入队</p>
            </div>
          </div>
          <div class="rank-metric">
            <strong>--</strong>
            <small>待认领</small>
          </div>
        </div>
      `;
    }

    const rosterActionHtml = isAdminSession() && !isCompetitionActive()
      ? `<button class="mini-danger-button" type="button" data-remove-participant="${escapeHtml(participant.id)}">移除</button>`
      : `
          <strong>已就位</strong>
          <small>等开局</small>
        `;

    return `
      <div class="rank-row ${participant.id === state.currentUserId ? "is-me" : ""}">
        <div class="rank-left">
          <span class="rank-index">${index + 1}</span>
          ${avatarHtml(participant, "avatar-sm")}
          <div>
            <p class="rank-name">${escapeHtml(participant.name)}${participant.id === state.currentUserId ? " · 我" : ""}</p>
            <p class="rank-sub">初始 ${formatNumber(participant.initialWeight, 1)}kg · 参赛席</p>
          </div>
        </div>
        <div class="rank-metric">
          ${rosterActionHtml}
        </div>
      </div>
    `;
  }).join("");

  const supporterRows = supporters.map((participant) => {
    const rosterActionHtml = isAdminSession() && !isCompetitionActive()
      ? `<button class="mini-danger-button" type="button" data-remove-participant="${escapeHtml(participant.id)}">移除</button>`
      : `
          <strong>陪伴</strong>
          <small>不结算</small>
        `;
    return `
      <div class="rank-row ${participant.id === state.currentUserId ? "is-me" : ""}">
        <div class="rank-left">
          <span class="rank-index">陪</span>
          ${avatarHtml(participant, "avatar-sm")}
          <div>
            <p class="rank-name">${escapeHtml(participant.name)}${participant.id === state.currentUserId ? " · 我" : ""}${roleBadgeHtml(participant)}</p>
            <p class="rank-sub">初始 ${formatNumber(participant.initialWeight, 1)}kg · 陪伴记录</p>
          </div>
        </div>
        <div class="rank-metric">
          ${rosterActionHtml}
        </div>
      </div>
    `;
  }).join("");

  return `${competitorRows}${supporterRows}`;
}

function computePayouts(results, leaders) {
  const payouts = Object.fromEntries(results.map((item) => [item.id, { status: "pay", pay: 0, prize: 0 }]));
  if (!results.length || leaders.length === results.length) {
    leaders.forEach((leader) => {
      payouts[leader.id] = { status: "win", pay: 0, prize: Math.round(ACTIVITY.poolAmount / leaders.length) };
    });
    return payouts;
  }

  const payers = results.filter((item) => !leaders.some((leader) => leader.id === item.id));
  const totalGap = payers.reduce((sum, item) => sum + item.gapToLeader, 0);
  const prizePerLeader = Math.round(ACTIVITY.poolAmount / leaders.length);

  leaders.forEach((leader) => {
    payouts[leader.id] = { status: "win", pay: 0, prize: prizePerLeader };
  });

  if (totalGap <= 0) return payouts;

  const rawPayments = payers.map((item) => {
    const raw = (ACTIVITY.poolAmount * item.gapToLeader) / totalGap;
    return { id: item.id, floor: Math.floor(raw), fraction: raw - Math.floor(raw) };
  });

  let remainder = ACTIVITY.poolAmount - rawPayments.reduce((sum, item) => sum + item.floor, 0);
  rawPayments
    .sort((a, b) => b.fraction - a.fraction)
    .forEach((item) => {
      const extra = remainder > 0 ? 1 : 0;
      payouts[item.id] = { status: "pay", pay: item.floor + extra, prize: 0 };
      remainder -= extra;
    });

  return payouts;
}

function rankRowHtml(item, computed, compact) {
  const payout = computed.payouts[item.id];
  const moneyText = isSupporter(item)
    ? "陪伴不结算"
    : payout.status === "win" ? `得 ¥${formatMoney(payout.prize)}` : `付 ¥${formatMoney(payout.pay)}`;
  const rowClasses = [
    "rank-row",
    item.id === state.currentUserId ? "is-me" : "",
    item.isLeader ? "is-leader" : "",
  ].filter(Boolean).join(" ");
  return `
    <div class="${rowClasses}">
      <div class="rank-left">
        ${rankIndexHtml(item)}
        ${avatarHtml(item, compact ? "avatar-sm" : "avatar-md")}
        <div>
          <p class="rank-name">${escapeHtml(item.name)}${item.id === state.currentUserId ? " · 我" : ""}${roleBadgeHtml(item)}</p>
          <p class="rank-sub">${formatSignedKg(item.deltaKg)} · ${compact ? moneyText : `当前 ${formatNumber(item.currentWeight, 1)}kg`}</p>
        </div>
      </div>
      <div class="rank-metric">
        <strong class="${item.lossRate < 0 ? "gain" : "loss"}">${formatRate(item.lossRate)}</strong>
        <small>${compact ? "减重率" : moneyText}</small>
      </div>
    </div>
  `;
}

function renderHeatmap(computed) {
  const results = computed.displayResults;
  if (!elements.activityHeatmap) return;
  if (!results.length) {
    elements.activityHeatmap.innerHTML = `<p class="muted">当前筛选下还没有成员。</p>`;
    return;
  }

  const days = getRecentDays(14);
  elements.activityHeatmap.innerHTML = results.map((item) => {
    const entryDates = new Set(item.entries.map((entry) => entry.date));
    const cells = days.map((day) => {
      const classes = [
        "heatmap-cell",
        entryDates.has(day.date) ? "is-on" : "",
        day.date === getTodayISO() ? "is-today" : "",
      ].filter(Boolean).join(" ");
      return `<span class="${classes}" title="${day.label}${entryDates.has(day.date) ? " 已记录" : " 未记录"}"></span>`;
    }).join("");
    return `
      <div class="heatmap-row ${item.id === state.currentUserId ? "is-me" : ""}">
        <div class="heatmap-name">
          <strong>${escapeHtml(item.name)}${roleBadgeHtml(item)}</strong>
          <small>${formatSignedKg(item.deltaKg)} · ${formatRate(item.lossRate)}</small>
        </div>
        <div class="heatmap-cells" aria-label="${escapeHtml(item.name)} 最近 14 天记录">${cells}</div>
      </div>
    `;
  }).join("");
}

function drawTrendChart(computed) {
  const canvas = elements.trendCanvas;
  if (!canvas || !canvas.offsetWidth) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (!isCompetitionActive()) {
    ctx.fillStyle = "#6f7882";
    ctx.font = "13px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("5 个席位坐满后生成曲线", rect.width / 2, rect.height / 2);
    return;
  }

  const timeline = getTimeline();
  const series = computed.displayResults.map((participant) => ({
    ...participant,
    points: timeline.map((tick) => calculateLossRate(participant.initialWeight, getWeightAtTick(participant, tick))),
  }));

  const allValues = series.flatMap((item) => item.points);
  let minValue = Math.min(0, ...allValues);
  let maxValue = Math.max(0, ...allValues);
  if (maxValue - minValue < 4) {
    const mid = (maxValue + minValue) / 2;
    minValue = mid - 2;
    maxValue = mid + 2;
  } else {
    minValue -= 0.8;
    maxValue += 0.8;
  }

  const pad = { top: 22, right: 18, bottom: 38, left: 42 };
  const width = rect.width - pad.left - pad.right;
  const height = rect.height - pad.top - pad.bottom;
  const xFor = (index) => pad.left + (timeline.length === 1 ? width : (width * index) / (timeline.length - 1));
  const yFor = (value) => pad.top + ((maxValue - value) / (maxValue - minValue)) * height;

  ctx.lineWidth = 1;
  ctx.font = "11px Inter, system-ui, sans-serif";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= 4; i += 1) {
    const value = minValue + ((maxValue - minValue) * i) / 4;
    const y = yFor(value);
    ctx.strokeStyle = "#e3e8ee";
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(rect.width - pad.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#738091";
    ctx.textAlign = "right";
    ctx.fillText(`${formatNumber(value, 1)}%`, pad.left - 8, y);
  }

  if (minValue < 0 && maxValue > 0) {
    const zeroY = yFor(0);
    ctx.strokeStyle = "#95a3b3";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    ctx.lineTo(rect.width - pad.right, zeroY);
    ctx.stroke();
  }

  timeline.forEach((tick, index) => {
    const x = xFor(index);
    ctx.fillStyle = "#738091";
    ctx.textAlign = index === 0 ? "left" : index === timeline.length - 1 ? "right" : "center";
    ctx.fillText(tick.label, x, rect.height - 16);
  });

  series.slice().reverse().forEach((participant) => {
    const isLeader = computed.leaders.some((leader) => leader.id === participant.id);
    ctx.strokeStyle = participant.color;
    ctx.lineWidth = isLeader ? 3.5 : 2;
    ctx.globalAlpha = isLeader ? 1 : 0.68;
    ctx.beginPath();
    participant.points.forEach((point, index) => {
      const x = xFor(index);
      const y = yFor(point);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    participant.points.forEach((point, index) => {
      const x = xFor(index);
      const y = yFor(point);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, isLeader ? 4.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = participant.color;
      ctx.beginPath();
      ctx.arc(x, y, isLeader ? 3 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  });
}

function getTimeline() {
  const dates = new Set([getTodayISO()]);
  const source = viewScope === VIEW_SCOPE_COMPETITORS ? getCompetitors() : state.participants;
  source.forEach((participant) => {
    participant.entries.forEach((entry) => dates.add(entry.date));
  });

  const sortedDates = [...dates].sort();
  const ticks = sortedDates.map((date) => ({
    date,
    label: date === getTodayISO() ? "今日" : formatDateShort(date),
  }));

  return [{ date: getCompetitionStartDate(), label: "起始", useInitial: true }, ...ticks];
}

function getCompetitionStartDate() {
  return state.competition?.startedAt || getTodayISO();
}

function getCurrentUser() {
  return state.participants.find((participant) => participant.id === state.currentUserId) || null;
}

function isMemberSession() {
  return state.sessionRole === ROLE_MEMBER && Boolean(getCurrentUser());
}

function isAdminSession() {
  return state.sessionRole === ROLE_ADMIN;
}

function hasValidSession() {
  return isAdminSession() || isMemberSession();
}

function getAdminProfile() {
  return {
    id: "admin",
    name: "管理员",
    color: "#101418",
    avatar: "",
  };
}

function getLatestEntry(participant) {
  return [...participant.entries].sort((a, b) => b.date.localeCompare(a.date))[0];
}

function getCurrentWeight(participant) {
  return getLatestEntry(participant)?.weight ?? participant.initialWeight;
}

function getWeightAtDate(participant, date) {
  const entries = [...participant.entries].filter((entry) => entry.date <= date).sort((a, b) => b.date.localeCompare(a.date));
  return entries[0]?.weight ?? participant.initialWeight;
}

function getWeightAtTick(participant, tick) {
  if (tick.useInitial) return participant.initialWeight;
  return getWeightAtDate(participant, tick.date);
}

function upsertEntry(participant, date, weight) {
  const existing = participant.entries.find((entry) => entry.date === date);
  if (existing) {
    existing.weight = weight;
    existing.updatedAt = new Date().toISOString();
    return;
  }
  participant.entries.push({ date, weight, createdAt: new Date().toISOString() });
}

async function handleAvatarFile(event, onLoad) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("请选择图片文件");
    return;
  }

  try {
    onLoad(await resizeAvatarFile(file));
  } catch (error) {
    console.error(error);
    event.target.value = "";
    showToast("头像处理失败，请换一张图片");
  }
}

async function resizeAvatarFile(file) {
  const image = await loadImageSource(file);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE_PX;
  canvas.height = AVATAR_SIZE_PX;

  const context = canvas.getContext("2d");
  context.fillStyle = "#f8fafc";
  context.fillRect(0, 0, AVATAR_SIZE_PX, AVATAR_SIZE_PX);

  const sourceWidth = image.width;
  const sourceHeight = image.height;
  const sourceSize = Math.min(sourceWidth, sourceHeight);
  const sourceX = (sourceWidth - sourceSize) / 2;
  const sourceY = (sourceHeight - sourceSize) / 2;
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, AVATAR_SIZE_PX, AVATAR_SIZE_PX);

  if (image.close) image.close();
  return canvas.toDataURL("image/jpeg", AVATAR_QUALITY);
}

async function loadImageSource(file) {
  if (window.createImageBitmap) {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Avatar image decode failed"));
    };
    image.src = objectUrl;
  });
}

function renderAvatar(target, participant, fallback = "", avatarOverride = "") {
  const avatar = avatarOverride || participant.avatar;
  target.style.background = participant.color || "#64748b";
  if (avatar) {
    target.innerHTML = `<img src="${avatar}" alt="${escapeHtml(participant.name)} 的头像">`;
  } else {
    target.textContent = getInitial(fallback || participant.name);
  }
}

function avatarHtml(participant, className = "avatar-sm", avatarOverride = "", fallback = "") {
  const avatar = avatarOverride || participant.avatar;
  const initial = getInitial(fallback || participant.name);
  const color = participant.color || "#64748b";
  if (avatar) {
    return `<span class="avatar ${className}"><img src="${avatar}" alt="${escapeHtml(participant.name)} 的头像"></span>`;
  }
  return `<span class="avatar ${className}" style="background:${color}">${escapeHtml(initial)}</span>`;
}

function createParticipantId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getInitial(name) {
  return String(name || "我").trim().slice(0, 1).toUpperCase();
}

function calculateLossRate(initialWeight, currentWeight) {
  if (!initialWeight) return 0;
  return round2(((initialWeight - currentWeight) / initialWeight) * 100);
}

function isValidWeight(value) {
  return Number.isFinite(value) && value >= 30 && value <= 250;
}

function isValidAccessCode(value) {
  return value.length >= 6 && value.length <= 20;
}

async function createAccessCodeHash(value) {
  try {
    return await hashText(value);
  } catch (error) {
    console.error(error);
    showToast("当前浏览器不支持安全登录码");
    return "";
  }
}

async function verifyAccessCode(value, expectedHash) {
  try {
    return await hashText(value) === expectedHash;
  } catch (error) {
    console.error(error);
    showToast("当前浏览器不支持安全登录码");
    return false;
  }
}

async function hashText(value) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Crypto API is unavailable");
  }
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getTodayISO() {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(new Date());
  if (today > ACTIVITY.endDate) return ACTIVITY.endDate;
  return today;
}

function getRecentDays(count) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = new Date(`${getTodayISO()}T00:00:00+08:00`);
  const todayIso = getTodayISO();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (count - 1 - index));
    const iso = formatter.format(date);
    return {
      date: iso,
      label: iso === todayIso ? "今日" : formatDateShort(iso),
    };
  });
}

function daysBetween(startIso, endIso) {
  const start = new Date(`${startIso}T00:00:00+08:00`);
  const end = new Date(`${endIso}T00:00:00+08:00`);
  return Math.max(0, Math.ceil((end - start) / 86400000));
}

function formatDateShort(iso) {
  const [, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function formatRate(rate) {
  return `${formatNumber(rate, 2)}%`;
}

function formatSignedKg(value) {
  const prefix = value > 0 ? "已减" : value < 0 ? "增重" : "持平";
  return `${prefix} ${formatNumber(Math.abs(value), 1)}kg`;
}

function formatMoney(value) {
  return Math.round(value).toLocaleString("zh-CN");
}

function formatNumber(value, digits) {
  return Number(value).toFixed(digits);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function nearlyEqual(a, b) {
  return Math.abs(a - b) < 0.005;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("toast-visible");
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("toast-visible");
  }, 1800);
}
