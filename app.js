const ACTIVITY = {
  name: "Limos",
  poolAmount: 25000,
  endDate: "2026-09-30",
  maxParticipants: 5,
};

const STORAGE_KEY = "limos_state_v1";
const SESSION_KEY = "limos_session_v1";
const LEGACY_SESSION_KEY = "limos_current_user_id_v1";
const API_CACHE_KEY = "limos_api_cache_v1";
const MUTATION_QUEUE_KEY = "limos_mutation_queue_v1";
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
const BMI_SCALE_MIN = 16;
const BMI_SCALE_MAX = 32;
const BMI_CATEGORIES = [
  {
    key: "under",
    label: "偏瘦",
    range: "< 18.5",
    min: Number.NEGATIVE_INFINITY,
    max: 18.5,
    summary: "低于中国成人参考下限",
  },
  {
    key: "normal",
    label: "标准",
    range: "18.5-23.9",
    min: 18.5,
    max: 24,
    summary: "处在中国成人标准区间",
  },
  {
    key: "over",
    label: "超重",
    range: "24.0-27.9",
    min: 24,
    max: 28,
    summary: "进入超重区间，留意趋势",
  },
  {
    key: "obese",
    label: "肥胖",
    range: ">= 28.0",
    min: 28,
    max: Number.POSITIVE_INFINITY,
    summary: "进入肥胖区间，建议稳步管理",
  },
];

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
let pendingAvatarColor = "";
let pendingProfileAvatar = "";
let pendingProfileAvatarColor = "";
let authMode = "login";
let joinRole = USER_ROLE_COMPETITOR;
let viewScope = VIEW_SCOPE_ALL;
let toastTimer = 0;
let remoteSyncTimer = 0;
let avatarHydrationTimer = 0;
let mutationSyncInFlight = false;
let editingTodayWeight = false;
let syncStatus = {
  kind: "idle",
  message: "",
  updatedAt: "",
};
let trendHoverIndex = null;
let trendChartMeta = null;
let trendAutoScrollToLatest = true;
let trendScrollFrame = 0;
let trendFocusParticipantId = "";
const avatarThemeColorCache = new Map();
const avatarHydrationInFlight = new Set();
const pendingAvatarUploadIds = new Set();

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
  heightCm: $("#height-cm"),
  avatarInput: $("#avatar-input"),
  avatarPreview: $("#avatar-preview"),
  onboardingForm: $("#onboarding-form"),
  toast: $("#toast"),
  topbarAvatar: $("#topbar-avatar"),
  topbarName: $("#topbar-name"),
  topbarStatus: $("#topbar-status"),
  syncStatus: $("#sync-status"),
  dashboardRank: $("#dashboard-rank"),
  dashboardRankLabel: $("#dashboard-rank-label"),
  dashboardRateLabel: $("#dashboard-rate-label"),
  dashboardRate: $("#dashboard-rate"),
  dashboardMoneyLabel: $("#dashboard-money-label"),
  dashboardMoney: $("#dashboard-money"),
  dashboardWeightDelta: $("#dashboard-weight-delta"),
  dashboardGap: $("#dashboard-gap"),
  daysLeft: $("#days-left"),
  seasonProgressLabel: $("#season-progress-label"),
  seasonProgressFill: $("#season-progress-fill"),
  weightForm: $("#weight-form"),
  weightCardTitle: $("#weight-card-title"),
  weightInput: $("#weight-input"),
  weightInputRow: $("#weight-input-row"),
  weightCheckinCard: $("#weight-checkin-card"),
  weightCheckinValue: $("#weight-checkin-value"),
  weightCheckinMeta: $("#weight-checkin-meta"),
  weightSubmitButton: $("#weight-submit-button"),
  weightEditButton: $("#weight-edit-button"),
  lastEntryText: $("#last-entry-text"),
  teamActionButton: $("#team-action-button"),
  invitePanel: $("#invite-panel"),
  inviteLink: $("#invite-link"),
  copyInviteButton: $("#copy-invite-button"),
  dashboardLeaderboard: $("#dashboard-leaderboard"),
  trendTotalScope: $("#trend-total-scope"),
  trendTotalLoss: $("#trend-total-loss"),
  trendTotalNote: $("#trend-total-note"),
  trendScroll: $("#trend-scroll"),
  trendAxisCanvas: $("#trend-axis-canvas"),
  trendCanvas: $("#trend-canvas"),
  trendLegend: $("#trend-legend"),
  activityHeatmap: $("#activity-heatmap"),
  chartRangeLabel: $("#chart-range-label"),
  winnerCard: $("#winner-card"),
  payoutList: $("#payout-list"),
  ledgerHelpButton: $("#ledger-help-button"),
  ledgerHelpModal: $("#ledger-help-modal"),
  ledgerHelpClose: $("#ledger-help-close"),
  rankList: $("#rank-list"),
  profileAvatar: $("#profile-avatar"),
  profileName: $("#profile-name"),
  profileSummary: $("#profile-summary"),
  profileForm: $("#profile-form"),
  profileHealthPanel: $("#profile-health-panel"),
  profileNameInput: $("#profile-name-input"),
  profileHeightInput: $("#profile-height-input"),
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
  state = dataStore.loadLocal ? dataStore.loadLocal() : await dataStore.load();
  await refreshAvatarThemeColors();
  bindEvents();
  authMode = state.participants.length ? "login" : "register";
  renderOnboardingOptions();

  if (hasValidSession()) {
    showApp();
  } else {
    showOnboarding();
  }

  queueAvatarHydration();
  startRemoteSync();
  syncRemoteState({ render: true }).catch((error) => console.error(error));
}

function bindEvents() {
  elements.avatarInput.addEventListener("change", (event) => handleAvatarFile(event, ({ dataUrl, themeColor }) => {
    pendingAvatar = dataUrl;
    pendingAvatarColor = themeColor;
    renderAvatar(elements.avatarPreview, getDraftParticipant(), "我", dataUrl);
  }));
  elements.profileAvatarInput.addEventListener("change", (event) => handleAvatarFile(event, ({ dataUrl, themeColor }) => {
    pendingProfileAvatar = dataUrl;
    pendingProfileAvatarColor = themeColor;
    renderAvatar(elements.profileAvatarPreview, getPreviewProfileUser(), "我", dataUrl);
  }));
  elements.onboardingForm.addEventListener("submit", submitOnboarding);
  elements.weightForm.addEventListener("submit", submitWeight);
  elements.weightEditButton.addEventListener("click", () => {
    editingTodayWeight = true;
    renderDashboard(getComputed());
    elements.weightInput.focus();
  });
  elements.profileForm.addEventListener("submit", submitProfile);
  elements.leaveTeamButton.addEventListener("click", leaveTeam);
  elements.resetButton.addEventListener("click", logout);
  elements.logoutButton.addEventListener("click", logout);
  elements.teamActionButton.addEventListener("click", handleTeamAction);
  elements.copyInviteButton.addEventListener("click", handleCopyInviteLink);
  elements.ledgerHelpButton.addEventListener("click", openLedgerHelp);
  elements.ledgerHelpClose.addEventListener("click", closeLedgerHelp);
  elements.ledgerHelpModal.addEventListener("click", (event) => {
    if (event.target === elements.ledgerHelpModal) closeLedgerHelp();
  });
  elements.trendCanvas.addEventListener("pointermove", handleTrendPointer);
  elements.trendCanvas.addEventListener("pointerdown", handleTrendPointer);
  elements.trendCanvas.addEventListener("pointerleave", clearTrendPointer);
  elements.trendLegend.addEventListener("click", handleTrendLegendClick);
  elements.trendScroll.addEventListener("scroll", () => {
    if (trendScrollFrame) return;
    trendScrollFrame = requestAnimationFrame(() => {
      trendScrollFrame = 0;
      drawTrendChart(getComputed());
    });
  }, { passive: true });
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
  window.addEventListener("online", () => {
    drainMutationQueue({ notify: true, render: true }).catch((error) => console.error(error));
  });
  window.addEventListener("beforeunload", (event) => {
    if (!loadMutationQueue().length) return;
    event.preventDefault();
    event.returnValue = "";
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.ledgerHelpModal.classList.contains("hidden")) {
      closeLedgerHelp();
    }
  });
}

function openLedgerHelp() {
  elements.ledgerHelpModal.classList.remove("hidden");
  elements.ledgerHelpClose.focus();
}

function closeLedgerHelp() {
  elements.ledgerHelpModal.classList.add("hidden");
  elements.ledgerHelpButton.focus();
}

function setSyncStatus(kind, message) {
  syncStatus = {
    kind,
    message,
    updatedAt: new Date().toISOString(),
  };
  renderSyncStatus();
}

function renderSyncStatus() {
  if (!elements.syncStatus) return;

  if (dataStore.type !== "api") {
    elements.syncStatus.textContent = "本机模式";
    elements.syncStatus.dataset.status = "local";
    return;
  }

  const pendingCount = loadMutationQueue().length;
  const kind = pendingCount && syncStatus.kind !== "syncing" ? "pending" : syncStatus.kind;
  const message = pendingCount && syncStatus.kind !== "syncing"
    ? `${pendingCount} 条待同步`
    : syncStatus.message || "云端已同步";
  elements.syncStatus.textContent = message;
  elements.syncStatus.dataset.status = kind || "idle";
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
  if (dataStore.type === "api") setSyncStatus("syncing", "正在保存");
  return dataStore.save(state).then(() => {
    if (dataStore.type === "api") setSyncStatus("synced", "云端已同步");
  }).catch((error) => {
    if (dataStore.type === "api") setSyncStatus("failed", "同步失败");
    console.error(error);
    showToast("保存失败，已保留本地副本");
    throw error;
  });
}

function saveLocalState(nextState) {
  const localState = normalizeState(nextState);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(localState));
}

function loadApiCacheMeta(config) {
  try {
    const saved = JSON.parse(localStorage.getItem(API_CACHE_KEY));
    if (saved?.stateId === config.stateId && saved?.endpoint === (config.apiEndpoint || "/api/state")) {
      return {
        etag: saved.etag || "",
      };
    }
  } catch {
    localStorage.removeItem(API_CACHE_KEY);
  }

  return { etag: "" };
}

function saveApiCacheMeta(config, etag) {
  if (!etag) return;
  localStorage.setItem(API_CACHE_KEY, JSON.stringify({
    endpoint: config.apiEndpoint || "/api/state",
    stateId: config.stateId || "",
    etag,
  }));
}

function mergeLocalAvatars(remoteState) {
  const localState = loadLocalState();
  const localAvatars = new Map(localState.participants
    .filter((participant) => participant.avatar)
    .map((participant) => [participant.id, participant.avatar]));

  return {
    ...remoteState,
    participants: remoteState.participants.map((participant) => {
      if (participant.avatar || !localAvatars.has(participant.id)) return participant;
      return { ...participant, avatar: localAvatars.get(participant.id) };
    }),
  };
}

function createApiPayload(nextState) {
  return {
    competition: nextState.competition,
    participants: nextState.participants.map((participant) => {
      const { avatar, ...rest } = participant;
      if (pendingAvatarUploadIds.has(participant.id) && avatar) {
        return { ...rest, avatar };
      }
      return rest;
    }),
  };
}

function loadMutationQueue() {
  try {
    const saved = JSON.parse(localStorage.getItem(MUTATION_QUEUE_KEY));
    return Array.isArray(saved) ? saved.filter((item) => item?.id && item?.type) : [];
  } catch {
    localStorage.removeItem(MUTATION_QUEUE_KEY);
    return [];
  }
}

function saveMutationQueue(queue) {
  const normalizedQueue = Array.isArray(queue) ? queue.filter((item) => item?.id && item?.type) : [];
  if (!normalizedQueue.length) {
    localStorage.removeItem(MUTATION_QUEUE_KEY);
    return;
  }
  localStorage.setItem(MUTATION_QUEUE_KEY, JSON.stringify(normalizedQueue));
}

function enqueueMutation(mutation) {
  const queue = loadMutationQueue();
  if (queue.some((item) => item.id === mutation.id)) return;
  queue.push(mutation);
  saveMutationQueue(queue);
  setSyncStatus("pending", `${queue.length} 条待同步`);
}

function removeMutation(mutationId) {
  saveMutationQueue(loadMutationQueue().filter((item) => item.id !== mutationId));
}

function hasPendingWeightEntry(participantId, date) {
  return loadMutationQueue().some((mutation) => (
    mutation.type === "weight-entry"
    && mutation.participantId === participantId
    && mutation.date === date
  ));
}

function createWeightEntryMutation(participantId, entry) {
  const mutationId = createParticipantId();
  return {
    id: mutationId,
    type: "weight-entry",
    participantId,
    date: entry.date,
    weight: entry.weight,
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
}

function applyPendingMutations(nextState) {
  const mergedState = normalizeState(nextState);
  loadMutationQueue().forEach((mutation) => {
    applyMutationToState(mergedState, mutation);
  });
  return normalizeState(mergedState);
}

function applyMutationToState(targetState, mutation) {
  if (mutation.type !== "weight-entry") return;
  const participant = targetState.participants.find((item) => item.id === mutation.participantId);
  if (!participant) return;
  upsertEntry(participant, mutation.date, round1(Number(mutation.weight)), {
    createdAt: mutation.createdAt,
    updatedAt: mutation.updatedAt,
    mutationId: mutation.id,
  });
}

async function drainMutationQueue(options = {}) {
  if (dataStore.type !== "api" || typeof dataStore.syncMutation !== "function" || mutationSyncInFlight) return;

  mutationSyncInFlight = true;
  let syncedCount = 0;
  try {
    const queue = loadMutationQueue();
    if (!queue.length) {
      setSyncStatus("synced", "云端已同步");
      return;
    }

    setSyncStatus("syncing", `${queue.length} 条正在同步`);
    for (const mutation of queue) {
      try {
        await dataStore.syncMutation(mutation);
        removeMutation(mutation.id);
        syncedCount += 1;
      } catch (error) {
        console.error(error);
        const pendingCount = loadMutationQueue().length || queue.length - syncedCount;
        setSyncStatus("pending", `${pendingCount} 条待同步`);
        if (options.notify) showToast("已先保存在本机，网络恢复后自动同步");
        break;
      }
    }
  } finally {
    mutationSyncInFlight = false;
  }

  const pendingCount = loadMutationQueue().length;
  if (!pendingCount) {
    setSyncStatus("synced", "云端已同步");
  }
  if (options.notify && syncedCount > 0 && !pendingCount) {
    showToast("已同步");
  }
  if (options.render && syncedCount > 0 && !elements.mainApp.classList.contains("hidden")) {
    renderAll();
  }
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
    heightCm: Number(participant.heightCm) || 0,
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

async function refreshAvatarThemeColors() {
  const targets = state.participants.filter((participant) => participant.avatar && isDefaultParticipantColor(participant.color));
  if (!targets.length) return;

  for (const participant of targets) {
    try {
      const themeColor = await getAvatarThemeColor(participant);
      if (themeColor && themeColor !== participant.color) {
        participant.color = themeColor;
      }
    } catch (error) {
      console.warn("Avatar theme color extraction failed", error);
    }
  }
}

function isDefaultParticipantColor(color) {
  const normalizedColor = String(color || "").toLowerCase();
  return !normalizedColor || PARTICIPANT_COLORS.some((item) => item.toLowerCase() === normalizedColor);
}

async function getAvatarThemeColor(participant) {
  const cacheKey = getAvatarThemeColorCacheKey(participant);
  if (avatarThemeColorCache.has(cacheKey)) {
    return avatarThemeColorCache.get(cacheKey);
  }

  const themeColor = await extractThemeColorFromDataUrl(participant.avatar);
  avatarThemeColorCache.set(cacheKey, themeColor);
  return themeColor;
}

function getAvatarThemeColorCacheKey(participant) {
  const avatar = String(participant.avatar || "");
  return `${participant.id}:${avatar.length}:${avatar.slice(0, 48)}:${avatar.slice(-48)}`;
}

function createDataStore(config) {
  if (config.storageMode === "api") {
    return createApiStore(config);
  }

  return {
    type: "local",
    loadLocal() {
      return loadLocalState();
    },
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
  const memberEndpoint = config.memberEndpoint || "/api/member";
  const weightEntryEndpoint = config.weightEntryEndpoint || "/api/weight-entry";

  async function requestState(options = {}) {
    const method = options.method || "GET";
    const apiCacheMeta = method === "GET" ? loadApiCacheMeta(config) : { etag: "" };
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };
    if (method === "GET" && apiCacheMeta.etag) {
      headers["If-None-Match"] = apiCacheMeta.etag;
    }

    const response = await fetch(endpoint, {
      cache: "no-store",
      ...options,
      headers,
    });

    const responseEtag = response.headers.get("ETag") || "";
    if (response.status === 304) {
      return { payload: loadLocalState(), unchanged: true };
    }

    if (!response.ok) {
      throw new Error(`State API failed: ${response.status}`);
    }

    if (responseEtag) saveApiCacheMeta(config, responseEtag);
    return response.json();
  }

  async function requestAvatar(participantId) {
    const avatarUrl = new URL(endpoint, window.location.href);
    avatarUrl.searchParams.set("avatar", participantId);
    const response = await fetch(avatarUrl.toString(), {
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.status === 404) return "";
    if (!response.ok) {
      throw new Error(`Avatar API failed: ${response.status}`);
    }

    const data = await response.json();
    return data?.avatar || "";
  }

  async function requestWeightEntry(mutation) {
    const response = await fetch(weightEntryEndpoint, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        participantId: mutation.participantId,
        date: mutation.date,
        weight: mutation.weight,
        createdAt: mutation.createdAt,
        updatedAt: mutation.updatedAt,
        mutationId: mutation.id,
      }),
    });

    if (!response.ok) {
      throw new Error(`Weight entry API failed: ${response.status}`);
    }
    return response.json();
  }

  async function requestMemberMutation(action, body = {}) {
    const response = await fetch(memberEndpoint, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        ...body,
      }),
    });

    if (!response.ok) {
      throw new Error(`Member API failed: ${response.status}`);
    }
    return response.json();
  }

  return {
    type: "api",
    loadLocal() {
      return applyPendingMutations(loadLocalState());
    },
    async load() {
      try {
        const data = await requestState();
        if (data?.payload) {
          const remoteState = applyPendingMutations(mergeLocalAvatars(normalizeState(data.payload)));
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
      const syncedAvatarIds = [...pendingAvatarUploadIds];
      const payload = createApiPayload(nextLocalState);
      await requestState({
        method: "PUT",
        body: JSON.stringify({ payload }),
      });
      syncedAvatarIds.forEach((id) => pendingAvatarUploadIds.delete(id));
    },
    async loadAvatar(participantId) {
      return requestAvatar(participantId);
    },
    async mutateMember(action, body) {
      return requestMemberMutation(action, body);
    },
    async syncMutation(mutation) {
      if (mutation.type === "weight-entry") {
        await requestWeightEntry(mutation);
        return;
      }
      throw new Error(`Unsupported mutation: ${mutation.type}`);
    },
  };
}

async function syncMemberMutation(action, body) {
  if (dataStore.type !== "api" || typeof dataStore.mutateMember !== "function") {
    await saveState();
    return null;
  }

  saveLocalState(state);
  setSyncStatus("syncing", "正在同步资料");
  try {
    const data = await dataStore.mutateMember(action, body);
    if (data?.payload) {
      const session = loadSession();
      const remoteState = applyPendingMutations(mergeLocalAvatars(normalizeState(data.payload)));
      state = {
        ...remoteState,
        currentUserId: session.participantId || "",
        sessionRole: session.role || "",
      };
      saveLocalState(state);
    }
    setSyncStatus("synced", "云端已同步");
    return data;
  } catch (error) {
    setSyncStatus("failed", "同步失败");
    throw error;
  }
}

function participantMutationPayload(participant, options = {}) {
  const { avatar, entries, ...rest } = participant;
  return {
    ...rest,
    ...(options.includeAvatar && avatar ? { avatar } : {}),
    ...(options.includeEntries ? { entries } : {}),
  };
}

function startRemoteSync() {
  if (dataStore.type !== "api" || remoteSyncTimer) return;

  remoteSyncTimer = window.setInterval(() => {
    syncRemoteState({ render: true }).catch((error) => console.error(error));
  }, REMOTE_SYNC_INTERVAL_MS);
}

async function syncRemoteState(options = {}) {
  if (dataStore.type !== "api") return;

  await drainMutationQueue();
  const session = loadSession();
  const remoteState = await dataStore.load();
  state = {
    ...remoteState,
    currentUserId: session.participantId || "",
    sessionRole: session.role || "",
  };
  await refreshAvatarThemeColors();
  saveLocalState(state);
  if (!loadMutationQueue().length) setSyncStatus("synced", "云端已同步");
  if (!options.render) {
    queueAvatarHydration();
    return;
  }

  if (!hasValidSession()) {
    const hasJoinDraft = Boolean(
      pendingAvatar
      || elements.displayName.value
      || elements.initialWeight.value
      || elements.heightCm.value
      || elements.accessCode.value,
    );
    if (!hasJoinDraft) {
      authMode = state.participants.length ? "login" : "register";
    }
    renderOnboardingOptions();
    showOnboarding();
    return;
  }

  renderOnboardingOptions();
  if (elements.mainApp.classList.contains("hidden")) {
    showApp();
  } else {
    renderAll();
  }
  queueAvatarHydration();
}

function queueAvatarHydration() {
  if (dataStore.type !== "api" || typeof dataStore.loadAvatar !== "function") return;
  window.clearTimeout(avatarHydrationTimer);
  avatarHydrationTimer = window.setTimeout(() => {
    hydrateMissingAvatars().catch((error) => console.error(error));
  }, 200);
}

async function hydrateMissingAvatars() {
  const targets = state.participants.filter((participant) => (
    !participant.avatar && !avatarHydrationInFlight.has(participant.id)
  ));
  if (!targets.length) return;

  for (const target of targets) {
    avatarHydrationInFlight.add(target.id);
    try {
      const avatar = await dataStore.loadAvatar(target.id);
      const participant = state.participants.find((item) => item.id === target.id);
      if (participant && avatar && !participant.avatar) {
        participant.avatar = avatar;
        saveLocalState(state);
        if (elements.mainApp.classList.contains("hidden")) {
          renderOnboardingOptions();
        } else {
          renderAll();
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      avatarHydrationInFlight.delete(target.id);
    }
  }
}

function showOnboarding() {
  elements.onboarding.classList.add("screen-active");
  elements.mainApp.classList.add("hidden");
  hydrateOnboardingForm();
  queueAvatarHydration();
}

function showApp() {
  elements.onboarding.classList.remove("screen-active");
  elements.mainApp.classList.remove("hidden");
  navigate("dashboard");
  renderAll();
  queueAvatarHydration();
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
  pendingAvatarColor = "";
  elements.displayName.value = "";
  elements.initialWeight.value = "";
  elements.heightCm.value = "";
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
  const heightCm = Number(elements.heightCm.value);
  const accessCode = elements.accessCode.value.trim();

  if (!name || !isValidWeight(initialWeight) || !isValidHeight(heightCm)) {
    showToast("填好昵称、初始体重和身高");
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
    color: pendingAvatarColor || PARTICIPANT_COLORS[state.participants.length % PARTICIPANT_COLORS.length],
    initialWeight: round1(initialWeight),
    heightCm: round1(heightCm),
    avatar: pendingAvatar,
    userRole,
    accessCodeHash,
    joinedAt: new Date().toISOString(),
    entries: [],
  };
  state.participants.push(participant);
  pendingAvatarUploadIds.add(participant.id);
  maybeStartCompetition();
  saveSession({ role: ROLE_MEMBER, participantId: participant.id });
  try {
    await syncMemberMutation("join", {
      participant: participantMutationPayload(participant, {
        includeAvatar: true,
        includeEntries: true,
      }),
    });
    pendingAvatarUploadIds.delete(participant.id);
  } catch {
    state.participants = previousParticipants;
    state.competition = previousCompetition;
    clearSession();
    return;
  }

  pendingAvatar = "";
  pendingAvatarColor = "";
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
    color: pendingAvatarColor || PARTICIPANT_COLORS[state.participants.length % PARTICIPANT_COLORS.length],
    initialWeight: 0,
    heightCm: Number(elements.heightCm?.value) || 0,
    avatar: pendingAvatar,
    userRole: joinRole,
    entries: [],
  };
}

function getPreviewProfileUser() {
  const participant = getCurrentUser();
  if (!participant) return getDraftParticipant();
  return {
    ...participant,
    color: pendingProfileAvatarColor || participant.color,
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

  const entry = upsertEntry(participant, getTodayISO(), round1(weight));
  editingTodayWeight = false;
  saveLocalState(state);
  elements.weightInput.value = "";
  renderAll();

  if (dataStore.type === "api") {
    enqueueMutation(createWeightEntryMutation(participant.id, entry));
    showToast("已记录，正在同步");
    drainMutationQueue({ notify: true, render: true }).catch((error) => console.error(error));
    return;
  }

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
  const heightCm = Number(elements.profileHeightInput.value);

  if (!participant || !name || !isValidHeight(heightCm)) {
    showToast("昵称和身高都要填好");
    return;
  }

  const previousName = participant.name;
  const previousHeightCm = participant.heightCm;
  const previousAvatar = participant.avatar;
  const previousColor = participant.color;
  participant.name = name;
  participant.heightCm = round1(heightCm);
  if (pendingProfileAvatar) {
    participant.avatar = pendingProfileAvatar;
    participant.color = pendingProfileAvatarColor || participant.color;
    pendingAvatarUploadIds.add(participant.id);
  }
  try {
    await syncMemberMutation("profile", {
      participantId: participant.id,
      profile: {
        name: participant.name,
        heightCm: participant.heightCm,
        color: participant.color,
        ...(pendingProfileAvatar ? { avatar: participant.avatar } : {}),
      },
    });
    if (pendingProfileAvatar) pendingAvatarUploadIds.delete(participant.id);
  } catch {
    participant.name = previousName;
    participant.heightCm = previousHeightCm;
    participant.avatar = previousAvatar;
    participant.color = previousColor;
    renderAll();
    return;
  }

  pendingProfileAvatar = "";
  pendingProfileAvatarColor = "";
  renderAll();
  showToast("资料已更新");
}

async function logout() {
  if (loadMutationQueue().length) {
    const shouldLogout = window.confirm("还有记录没有同步到云端。现在退出可能只能保留在这台设备上，确定退出吗？");
    if (!shouldLogout) return;
  }
  clearSession();
  state = await dataStore.load();
  await refreshAvatarThemeColors();
  pendingAvatar = "";
  pendingAvatarColor = "";
  pendingProfileAvatar = "";
  pendingProfileAvatarColor = "";
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
    await syncMemberMutation("remove", {
      participantId: participant.id,
    });
  } catch {
    state.participants = previousParticipants;
    state.competition = previousCompetition;
    saveSession({ role: ROLE_MEMBER, participantId: participant.id });
    renderAll();
    return;
  }

  pendingAvatar = "";
  pendingAvatarColor = "";
  pendingProfileAvatar = "";
  pendingProfileAvatarColor = "";
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
    await syncMemberMutation("remove", {
      participantId: participant.id,
    });
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
    renderSyncStatus();
    return;
  }

  const current = getCurrentUser();
  const result = computed.allResults.find((item) => item.id === current.id);
  renderAvatar(elements.topbarAvatar, current);
  elements.topbarName.textContent = current.name;
  elements.topbarStatus.textContent = isCompetitionActive()
    ? `${getRoleLabel(current)} · ${getRankText(result)} · ${formatRate(result.lossRate)}`
    : `${getRoleLabel(current)} · 参赛 ${getCompetitors().length}/${ACTIVITY.maxParticipants}`;
  renderSyncStatus();
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
    updateSeasonProgress(false);
    elements.dashboardRank.textContent = `${getCompetitors().length}/${ACTIVITY.maxParticipants}`;
    elements.dashboardRate.textContent = isSupporter(current) ? formatRate(result.lossRate) : "--";
    elements.dashboardRate.classList.toggle("gain", isSupporter(current) && result.lossRate < 0);
    elements.dashboardRate.classList.toggle("loss", isSupporter(current) && result.lossRate >= 0);
    elements.dashboardMoneyLabel.textContent = "还差";
    elements.dashboardMoney.textContent = `${remaining} 位`;
    elements.dashboardWeightDelta.textContent = isSupporter(current)
      ? `${formatSignedKg(result.deltaKg)} · ${getBodyStatsText(current, result.currentWeight)}`
      : `初始 ${formatNumber(current.initialWeight, 1)}kg · ${getBodyStatsText(current, current.initialWeight)}`;
    elements.dashboardGap.textContent = "5 位参赛成员坐满自动开局";
    elements.weightForm.classList.toggle("hidden", isCompetitor(current));
    renderWeightCard(current, "陪伴用户可以先记录体重");
    elements.dashboardLeaderboard.innerHTML = waitingListHtml();
    return;
  }

  setTeamAction("rank");
  elements.weightForm.classList.remove("hidden");

  updateSeasonProgress(true);
  elements.dashboardRank.textContent = isCompetitor(current) ? result.competitionRank : result.allRank;
  elements.dashboardRate.textContent = formatRate(result.lossRate);
  elements.dashboardRate.classList.toggle("gain", result.lossRate < 0);
  elements.dashboardRate.classList.toggle("loss", result.lossRate >= 0);
  elements.dashboardWeightDelta.textContent = `${formatSignedKg(result.deltaKg)} · 当前 ${formatNumber(result.currentWeight, 1)}kg · ${getBmiText(current, result.currentWeight)}`;
  elements.dashboardGap.textContent = isSupporter(current)
    ? "陪伴用户不参与奖金结算"
    : result.isLeader
    ? computed.leaders.length > 1 ? "并列领跑，等下一次破局" : "你在领跑"
    : `落后第一名 ${formatNumber(result.gapToLeader, 2)} 个百分点`;

  if (isSupporter(current)) {
    elements.dashboardMoneyLabel.textContent = "结算身份";
    elements.dashboardMoney.textContent = "陪伴";
  } else if (payout.status === "win") {
    elements.dashboardMoneyLabel.textContent = computed.leaders.length > 1 ? "并列领跑试算" : "预计可收";
    elements.dashboardMoney.textContent = `¥${formatMoney(payout.prize)}`;
  } else {
    elements.dashboardMoneyLabel.textContent = "预计应付";
    elements.dashboardMoney.textContent = `¥${formatMoney(payout.pay)}`;
  }

  renderWeightCard(current, "还没有上秤记录");

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
    updateSeasonProgress(false);
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
  updateSeasonProgress(true);
  elements.dashboardRate.textContent = formatRate(leader.lossRate);
  elements.dashboardRate.classList.toggle("gain", leader.lossRate < 0);
  elements.dashboardRate.classList.toggle("loss", leader.lossRate >= 0);
  elements.dashboardMoneyLabel.textContent = computed.leaders.length > 1 ? "并列领跑试算" : "预计赢家可收";
  elements.dashboardMoney.textContent = `¥${formatMoney(computed.payouts[leader.id].prize)}`;
  elements.dashboardWeightDelta.textContent = `当前领跑：${computed.leaders.map((item) => item.name).join("、")}`;
  elements.dashboardGap.textContent = "只读模式，不能记录体重";
  elements.dashboardLeaderboard.innerHTML = computed.displayResults.slice(0, 5).map((item) => rankRowHtml(item, computed, true)).join("");
}

function renderWeightCard(participant, emptyText) {
  const today = getTodayISO();
  const todayEntry = getEntryOnDate(participant, today);
  const showEditor = !todayEntry || editingTodayWeight;
  const weekStart = getWeekStartISO(today);
  const streak = getCurrentCheckinStreak(participant, today);
  const weekCount = getWeekCheckinCount(participant, weekStart);

  elements.weightForm.classList.toggle("is-checked", Boolean(todayEntry) && !showEditor);
  elements.weightCardTitle.textContent = todayEntry && !showEditor ? "今日已打卡" : "今天上秤";
  elements.lastEntryText.textContent = todayEntry && !showEditor
    ? "今天已记录"
    : getLastEntryLabel(participant, emptyText);
  elements.weightInputRow.classList.toggle("hidden", !showEditor);
  elements.weightSubmitButton.classList.toggle("hidden", !showEditor);
  elements.weightEditButton.classList.toggle("hidden", showEditor || !todayEntry);
  elements.weightCheckinCard.classList.toggle("hidden", showEditor || !todayEntry);

  if (showEditor) {
    if (todayEntry && !elements.weightInput.value) {
      elements.weightInput.value = formatNumber(todayEntry.weight, 1);
    }
    return;
  }

  elements.weightInput.value = "";
  elements.weightCheckinValue.textContent = `${formatNumber(todayEntry.weight, 1)}kg`;
  elements.weightCheckinMeta.textContent = `连续 ${streak} 天 · 本周 ${weekCount} 次`;
}

function updateSeasonProgress(isActive) {
  if (!elements.daysLeft || !elements.seasonProgressFill || !elements.seasonProgressLabel) return;
  if (!isActive) {
    elements.daysLeft.textContent = "小队集结中";
    elements.seasonProgressLabel.textContent = `满 ${ACTIVITY.maxParticipants} 人开局 · 9 月 30 日收官`;
    elements.seasonProgressFill.style.width = "0%";
    return;
  }

  const startDate = getCompetitionStartDate();
  const today = getTodayISO();
  const totalDays = Math.max(1, daysBetween(startDate, ACTIVITY.endDate));
  const remainingDays = daysBetween(today, ACTIVITY.endDate);
  const elapsedDays = clamp(daysBetween(startDate, today), 0, totalDays);
  const progress = clamp((elapsedDays / totalDays) * 100, 0, 100);

  elements.daysLeft.textContent = `剩余 ${remainingDays} 天`;
  elements.seasonProgressLabel.textContent = `已走 ${Math.round(progress)}% · 9 月 30 日收官`;
  elements.seasonProgressFill.style.width = `${progress}%`;
}

function scrollTrendToLatest() {
  const scroll = elements.trendScroll;
  if (!scroll || !isCompetitionActive() || !trendAutoScrollToLatest) return;
  requestAnimationFrame(() => {
    if (trendHoverIndex !== null) return;
    scroll.scrollLeft = scroll.scrollWidth;
    trendAutoScrollToLatest = false;
    drawTrendChart(getComputed());
  });
}

function renderTrend(computed) {
  renderTrendSummary(computed);
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
  scrollTrendToLatest();
  elements.trendLegend.innerHTML = computed.displayResults
    .map((item) => {
      return `
        <button class="legend-chip ${item.id === state.currentUserId ? "is-me" : ""} ${trendFocusParticipantId === item.id ? "is-active" : ""}" type="button" data-trend-member="${escapeHtml(item.id)}" style="--member-color:${item.color}">
          <span class="legend-chip-dot"></span>
          ${avatarHtml(item, "avatar-sm")}
          <span class="legend-chip-copy">
            <strong>${escapeHtml(item.name)}</strong>
            <small>${formatRate(item.lossRate)} · ${formatSignedKg(item.deltaKg)}</small>
          </span>
        </button>
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
            <p class="pay-sub">${isWin ? "预计可收" : `落后 ${formatNumber(item.gapToLeader, 2)} 个百分点`}</p>
          </div>
          <strong>${isWin ? "+" : "-"}¥${formatMoney(isWin ? payout.prize : payout.pay)}</strong>
        </div>
      `;
    })
    .join("");

  elements.rankList.innerHTML = computed.displayResults.map((item) => rankRowHtml(item, computed, false)).join("");
}

function calculateStreakForDates(dateSet, endDate) {
  let cursor = endDate;
  let streak = 0;
  while (dateSet.has(cursor)) {
    streak += 1;
    cursor = addDaysISO(cursor, -1);
  }
  return streak;
}

function getCheckinEntries(participant) {
  return Array.isArray(participant?.entries)
    ? participant.entries.filter((entry) => entry?.date && Number(entry.weight) > 0)
    : [];
}

function getCheckinDateSet(participant) {
  return new Set(getCheckinEntries(participant).map((entry) => entry.date));
}

function getWeekCheckinCount(participant, weekStart) {
  const weekEnd = addDaysISO(weekStart, 6);
  return [...getCheckinDateSet(participant)].filter((date) => date >= weekStart && date <= weekEnd).length;
}

function getCurrentCheckinStreak(participant, refDate = getTodayISO()) {
  const dateSet = getCheckinDateSet(participant);
  if (!dateSet.size) return 0;
  const yesterday = addDaysISO(refDate, -1);
  const streakEnd = dateSet.has(refDate) ? refDate : yesterday;
  return dateSet.has(streakEnd) ? calculateStreakForDates(dateSet, streakEnd) : 0;
}

function getWeekStartISO(iso) {
  const date = new Date(`${iso}T00:00:00+08:00`);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDaysISO(iso, offset);
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
    elements.profileHealthPanel.classList.add("hidden");
    elements.profileHealthPanel.innerHTML = "";
    elements.historyList.innerHTML = `<p class="muted">管理员不能记录体重，只负责查看和维护成员。</p>`;
    return;
  }

  elements.profileForm.classList.remove("hidden");
  elements.profileHealthPanel.classList.remove("hidden");
  const current = getCurrentUser();
  const result = computed.allResults.find((item) => item.id === current.id);
  elements.leaveTeamButton.classList.toggle("hidden", isCompetitionActive());
  renderAvatar(elements.profileAvatar, current);
  elements.profileName.textContent = current.name;
  elements.profileSummary.textContent = isCompetitionActive()
    ? `${getRoleLabel(current)} · ${getHeightText(current)} · 当前 ${formatNumber(result.currentWeight, 1)}kg · ${getBmiText(current, result.currentWeight)}`
    : `${getRoleLabel(current)} · 初始 ${formatNumber(current.initialWeight, 1)}kg · ${getHeightText(current)} · 还差 ${ACTIVITY.maxParticipants - getCompetitors().length} 位参赛开局`;
  elements.profileNameInput.value = current.name;
  elements.profileHeightInput.value = current.heightCm ? formatCompactNumber(current.heightCm, 1) : "";
  renderAvatar(elements.profileAvatarPreview, current);
  renderHealthPanel(current, result);

  const entries = [...current.entries].sort((a, b) => b.date.localeCompare(a.date));
  elements.historyList.innerHTML = entries.length
    ? entries.map((entry) => {
        const rate = calculateLossRate(current.initialWeight, entry.weight);
        return `
          <div class="history-row">
            <div>
              <strong>${formatDateShort(entry.date)}</strong>
              <p class="rank-sub">相对初始 ${formatRate(rate)} · ${getBmiText(current, entry.weight)}</p>
            </div>
            <strong>${formatNumber(entry.weight, 1)}kg</strong>
          </div>
        `;
      }).join("")
    : `<p class="muted">开局后，这里会记录每次上秤。</p>`;
}

function renderHealthPanel(participant, result) {
  const currentWeight = result?.currentWeight || getCurrentWeight(participant);
  const heightCm = Number(participant?.heightCm) || 0;
  const bmi = calculateBmi(currentWeight, heightCm);
  const category = getBmiCategory(bmi);
  const healthyRange = getHealthyWeightRange(heightCm);
  const markerPosition = bmi ? `${getBmiGaugePosition(bmi)}%` : "0%";
  const bmiValue = bmi ? formatNumber(bmi, 1) : "--";
  const currentWeightText = isValidWeight(currentWeight) ? `${formatNumber(currentWeight, 1)}kg` : "--";
  const healthyRangeText = healthyRange
    ? `${formatNumber(healthyRange.min, 1)}-${formatNumber(healthyRange.max, 1)}kg`
    : "补身高后显示";
  const sevenDayTrend = getSevenDayWeightTrend(participant, currentWeight);
  const healthyPosition = getHealthyWeightPosition(currentWeight, healthyRange);
  const summaryText = bmi
    ? category.summary
    : "补上身高后，会自动计算 BMI 和标准体重区间。";
  const categoryRangeText = bmi ? `当前落在 ${category.range}` : "身高 + 体重后自动计算";
  const markerColor = getBmiStatusColor(category.key);

  elements.profileHealthPanel.innerHTML = `
    <div class="health-panel-header">
      <div>
        <p class="health-eyebrow">个人健康看板</p>
        <h3>身体状态</h3>
      </div>
      <span class="health-badge">成人 BMI</span>
    </div>

    <div class="health-bmi-summary">
      <div class="bmi-readout bmi-${category.key}">
        <span>BMI</span>
        <strong>${bmiValue}</strong>
        <em>${category.label}</em>
      </div>
      <div class="bmi-copy">
        <strong>${summaryText}</strong>
        <p>${categoryRangeText}</p>
      </div>
    </div>

    <div class="bmi-gauge-wrap">
      <div class="bmi-gauge" style="--bmi-left: ${markerPosition}; --bmi-marker-color: ${markerColor}">
        <span class="bmi-segment bmi-under"></span>
        <span class="bmi-segment bmi-normal"></span>
        <span class="bmi-segment bmi-over"></span>
        <span class="bmi-segment bmi-obese"></span>
        ${bmi ? `<span class="bmi-marker" aria-label="当前 BMI ${bmiValue}"></span>` : ""}
      </div>
      <div class="bmi-band-labels" aria-hidden="true">
        <span>偏瘦</span>
        <span>标准</span>
        <span>超重</span>
        <span>肥胖</span>
      </div>
    </div>

    <div class="health-metrics" aria-label="健康指标">
      <div class="health-metric">
        <span>当前体重</span>
        <strong>${currentWeightText}</strong>
      </div>
      <div class="health-metric health-metric-${sevenDayTrend.tone}">
        <span>7 日趋势</span>
        <strong>${sevenDayTrend.value}</strong>
        <small>${sevenDayTrend.note}</small>
      </div>
      <div class="health-metric health-metric-${healthyPosition.tone}">
        <span>标准体重</span>
        <strong>${healthyRangeText}</strong>
        <small>${healthyPosition.value}</small>
      </div>
    </div>
  `;
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
    trendAutoScrollToLatest = true;
    requestAnimationFrame(() => {
      drawTrendChart(getComputed());
      scrollTrendToLatest();
    });
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
            <p class="rank-sub">初始 ${formatNumber(participant.initialWeight, 1)}kg · ${getHeightText(participant)} · 参赛席</p>
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
            <p class="rank-sub">初始 ${formatNumber(participant.initialWeight, 1)}kg · ${getHeightText(participant)} · 陪伴记录</p>
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
    : payout.status === "win" ? `预计得 ¥${formatMoney(payout.prize)}` : `预计付 ¥${formatMoney(payout.pay)}`;
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
          <p class="rank-sub">${formatSignedKg(item.deltaKg)} · ${compact ? moneyText : `当前 ${formatNumber(item.currentWeight, 1)}kg · ${getBmiText(item, item.currentWeight)}`}</p>
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

function renderTrendSummary(computed) {
  if (!elements.trendTotalLoss) return;
  const results = computed.displayResults;
  const totalDelta = round1(results.reduce((sum, item) => sum + item.deltaKg, 0));
  const averageDelta = results.length ? round1(totalDelta / results.length) : 0;
  const isNetGain = totalDelta < 0;
  const scopeText = viewScope === VIEW_SCOPE_COMPETITORS ? "参赛累计" : "小队累计";
  const memberText = viewScope === VIEW_SCOPE_COMPETITORS ? `参赛 ${results.length} 人` : `全部 ${results.length} 人`;
  const averageText = isNetGain ? `人均净增 ${formatNumber(Math.abs(averageDelta), 1)}kg` : `人均净减 ${formatNumber(Math.abs(averageDelta), 1)}kg`;

  elements.trendTotalScope.textContent = isNetGain ? `${scopeText}净增` : `${scopeText}净减`;
  elements.trendTotalLoss.textContent = `${formatNumber(Math.abs(totalDelta), 1)}kg`;
  elements.trendTotalLoss.classList.toggle("is-gain", isNetGain);
  elements.trendTotalNote.textContent = results.length ? `${memberText} · ${averageText}` : "当前范围暂无成员";
}

function handleTrendPointer(event) {
  if (!trendChartMeta || trendChartMeta.timelineLength <= 1) return;
  const rect = elements.trendCanvas.getBoundingClientRect();
  const relativeX = clamp(event.clientX - rect.left, trendChartMeta.pad.left, rect.width - trendChartMeta.pad.right);
  const ratio = (relativeX - trendChartMeta.pad.left) / trendChartMeta.width;
  trendHoverIndex = Math.round(ratio * (trendChartMeta.timelineLength - 1));
  drawTrendChart(getComputed());
}

function clearTrendPointer() {
  if (trendHoverIndex === null) return;
  trendHoverIndex = null;
  drawTrendChart(getComputed());
}

function handleTrendLegendClick(event) {
  const button = event.target.closest("[data-trend-member]");
  if (!button) return;
  const participantId = button.dataset.trendMember;
  trendFocusParticipantId = trendFocusParticipantId === participantId ? "" : participantId;
  renderTrend(getComputed());
}

function drawTrendChart(computed) {
  const canvas = elements.trendCanvas;
  const axisCanvas = elements.trendAxisCanvas;
  if (!canvas || !canvas.offsetWidth) return;

  const timeline = isCompetitionActive() ? getTimeline() : [];
  const scroll = elements.trendScroll || canvas.parentElement;
  const visibleWidth = scroll?.clientWidth || canvas.offsetWidth;
  const pad = { top: 24, right: 24, bottom: 42, left: 8 };
  const minPointGap = 46;
  const chartWidth = isCompetitionActive()
    ? Math.max(visibleWidth, pad.left + pad.right + Math.max(260, (timeline.length - 1) * minPointGap))
    : visibleWidth;
  canvas.style.width = `${Math.ceil(chartWidth)}px`;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  let axisCtx = null;
  let axisRect = null;
  if (axisCanvas) {
    axisRect = axisCanvas.getBoundingClientRect();
    axisCanvas.width = Math.round(axisRect.width * dpr);
    axisCanvas.height = Math.round(axisRect.height * dpr);
    axisCtx = axisCanvas.getContext("2d");
    axisCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    axisCtx.clearRect(0, 0, axisRect.width, axisRect.height);
  }

  if (!isCompetitionActive()) {
    trendChartMeta = null;
    ctx.fillStyle = "#6f7882";
    ctx.font = "13px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("5 个席位坐满后生成曲线", rect.width / 2, rect.height / 2);
    return;
  }

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

  const width = rect.width - pad.left - pad.right;
  const height = rect.height - pad.top - pad.bottom;
  const xFor = (index) => pad.left + (timeline.length === 1 ? width : (width * index) / (timeline.length - 1));
  const yFor = (value) => pad.top + ((maxValue - value) / (maxValue - minValue)) * height;
  const viewportLeft = scroll?.scrollLeft || 0;
  const viewportWidth = scroll?.clientWidth || rect.width;
  const isScrollableChart = scroll ? scroll.scrollWidth > scroll.clientWidth + 2 : false;
  trendChartMeta = {
    pad,
    width,
    timelineLength: timeline.length,
    viewportLeft,
    viewportRight: viewportLeft + viewportWidth,
    viewportWidth,
  };

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
    if (axisCtx && axisRect) {
      axisCtx.fillStyle = "#738091";
      axisCtx.textAlign = "right";
      axisCtx.font = "11px Inter, system-ui, sans-serif";
      axisCtx.textBaseline = "middle";
      axisCtx.fillText(`${formatNumber(value, 1)}%`, axisRect.width - 10, y);
    }
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

  const xTickGap = timeline.length > 1 ? width / (timeline.length - 1) : width;
  const labelStep = Math.max(1, Math.ceil(54 / Math.max(xTickGap, 1)));
  timeline.forEach((tick, index) => {
    const isEdge = index === 0 || index === timeline.length - 1;
    if (!isEdge && index % labelStep !== 0) return;
    const x = xFor(index);
    if (isScrollableChart) {
      const labelGuard = 48;
      const isVisible = x >= viewportLeft + labelGuard && x <= viewportLeft + viewportWidth - labelGuard;
      const isVisibleEdge = isEdge && x >= viewportLeft + 8 && x <= viewportLeft + viewportWidth - 8;
      if (!isVisible && !isVisibleEdge) return;
    }
    ctx.fillStyle = "#738091";
    ctx.textAlign = index === 0 ? "left" : index === timeline.length - 1 ? "right" : "center";
    ctx.fillText(tick.label, x, rect.height - 16);
  });

  const hasFocusedSeries = Boolean(trendFocusParticipantId && series.some((participant) => participant.id === trendFocusParticipantId));
  series.slice().reverse().forEach((participant) => {
    const isLeader = computed.leaders.some((leader) => leader.id === participant.id);
    const isFocused = participant.id === trendFocusParticipantId;
    const coordinates = participant.points.map((point, index) => ({
      x: xFor(index),
      y: yFor(point),
      value: point,
    }));
    ctx.strokeStyle = participant.color;
    ctx.lineWidth = isFocused ? 3.6 : isLeader ? 2.8 : 1.8;
    ctx.globalAlpha = hasFocusedSeries && !isFocused ? 0.16 : isFocused || isLeader ? 1 : 0.58;
    drawSmoothPath(ctx, coordinates);
    ctx.stroke();

    coordinates.forEach(({ x, y }, index) => {
      const isHoveredPoint = trendHoverIndex === index;
      const pointRadius = isHoveredPoint || isFocused ? 4.8 : isLeader ? 3.8 : 3;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, pointRadius + 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = participant.color;
      ctx.beginPath();
      ctx.arc(x, y, pointRadius - 0.8, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  });

  if (trendHoverIndex !== null && timeline[trendHoverIndex]) {
    drawTrendTooltip(ctx, rect, timeline, series, xFor, yFor);
  }
}

function drawSmoothPath(ctx, points) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 1) return;

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] || points[index];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[index + 2] || next;
    const controlOneX = current.x + (next.x - previous.x) / 6;
    const controlOneY = current.y + (next.y - previous.y) / 6;
    const controlTwoX = next.x - (afterNext.x - current.x) / 6;
    const controlTwoY = next.y - (afterNext.y - current.y) / 6;
    ctx.bezierCurveTo(controlOneX, controlOneY, controlTwoX, controlTwoY, next.x, next.y);
  }
}

function drawTrendTooltip(ctx, rect, timeline, series, xFor, yFor) {
  const index = Math.round(clamp(trendHoverIndex, 0, timeline.length - 1));
  const x = xFor(index);
  const rows = series
    .map((participant) => ({
      name: participant.name,
      color: participant.color,
      value: participant.points[index],
      y: yFor(participant.points[index]),
    }))
    .sort((a, b) => b.value - a.value);
  const visibleRows = rows.slice(0, 5);
  const viewportLeft = trendChartMeta.viewportLeft || 0;
  const viewportRight = trendChartMeta.viewportRight || rect.width;
  const viewportWidth = trendChartMeta.viewportWidth || rect.width;
  const cardWidth = Math.min(188, viewportWidth - 34);
  const cardHeight = 34 + visibleRows.length * 20;
  const cardX = x + cardWidth + 16 < viewportRight ? x + 12 : Math.max(viewportLeft + 12, x - cardWidth - 12);
  const cardY = 18;

  ctx.save();
  ctx.strokeStyle = "rgba(16, 20, 24, 0.16)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(x, trendChartMeta.pad.top);
  ctx.lineTo(x, rect.height - trendChartMeta.pad.bottom);
  ctx.stroke();
  ctx.setLineDash([]);

  rows.forEach((row) => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, row.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = row.color;
    ctx.beginPath();
    ctx.arc(x, row.y, 3.7, 0, Math.PI * 2);
    ctx.fill();
  });

  roundedRectPath(ctx, cardX, cardY, cardWidth, cardHeight, 16);
  ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
  ctx.stroke();

  ctx.fillStyle = "#101418";
  ctx.font = "700 12px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(timeline[index].label, cardX + 14, cardY + 18);

  ctx.font = "650 11px Inter, system-ui, sans-serif";
  visibleRows.forEach((row, rowIndex) => {
    const y = cardY + 39 + rowIndex * 20;
    ctx.fillStyle = row.color;
    ctx.beginPath();
    ctx.arc(cardX + 17, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#252c33";
    ctx.textAlign = "left";
    ctx.fillText(truncateCanvasText(ctx, row.name, 72), cardX + 28, y);
    ctx.fillStyle = row.value < 0 ? "#d84a5f" : "#1f7a5c";
    ctx.textAlign = "right";
    ctx.fillText(formatRate(row.value), cardX + cardWidth - 14, y);
  });
  ctx.restore();
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const nextRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + nextRadius, y);
  ctx.lineTo(x + width - nextRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + nextRadius);
  ctx.lineTo(x + width, y + height - nextRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - nextRadius, y + height);
  ctx.lineTo(x + nextRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - nextRadius);
  ctx.lineTo(x, y + nextRadius);
  ctx.quadraticCurveTo(x, y, x + nextRadius, y);
  ctx.closePath();
}

function truncateCanvasText(ctx, text, maxWidth) {
  const value = String(text || "");
  if (ctx.measureText(value).width <= maxWidth) return value;
  let truncated = value;
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
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

function getLastEntryLabel(participant, fallback) {
  const latest = getLatestEntry(participant);
  if (!latest) return fallback;

  const syncText = hasPendingWeightEntry(participant.id, latest.date) ? " · 同步中" : "";
  return `上次 ${formatDateShort(latest.date)} · ${formatNumber(latest.weight, 1)}kg${syncText}`;
}

function getCurrentWeight(participant) {
  return getLatestEntry(participant)?.weight ?? participant.initialWeight;
}

function getWeightAtDate(participant, date) {
  const entries = [...participant.entries].filter((entry) => entry.date <= date).sort((a, b) => b.date.localeCompare(a.date));
  return entries[0]?.weight ?? participant.initialWeight;
}

function getEntryOnDate(participant, date) {
  return Array.isArray(participant?.entries)
    ? participant.entries.find((entry) => entry.date === date)
    : null;
}

function getWeightAtTick(participant, tick) {
  if (tick.useInitial) return participant.initialWeight;
  return getWeightAtDate(participant, tick.date);
}

function upsertEntry(participant, date, weight, meta = {}) {
  const existing = participant.entries.find((entry) => entry.date === date);
  if (existing) {
    existing.weight = weight;
    existing.updatedAt = meta.updatedAt || new Date().toISOString();
    if (meta.mutationId) existing.mutationId = meta.mutationId;
    return existing;
  }
  const entry = {
    date,
    weight,
    createdAt: meta.createdAt || new Date().toISOString(),
    ...(meta.mutationId ? { mutationId: meta.mutationId } : {}),
  };
  participant.entries.push(entry);
  return entry;
}

async function handleAvatarFile(event, onLoad) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("请选择图片文件");
    return;
  }

  try {
    onLoad(await processAvatarFile(file));
  } catch (error) {
    console.error(error);
    event.target.value = "";
    showToast("头像处理失败，请换一张图片");
  }
}

async function processAvatarFile(file) {
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

  const themeColor = extractThemeColor(context, AVATAR_SIZE_PX);
  const dataUrl = canvas.toDataURL("image/jpeg", AVATAR_QUALITY);
  if (image.close) image.close();
  return { dataUrl, themeColor };
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

async function extractThemeColorFromDataUrl(dataUrl) {
  const image = await loadImageElement(dataUrl);
  const size = AVATAR_SIZE_PX;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, size, size);
  return extractThemeColor(context, size);
}

function loadImageElement(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Avatar image decode failed"));
    image.src = source;
  });
}

function extractThemeColor(context, size) {
  const pixels = context.getImageData(0, 0, size, size).data;
  let red = 0;
  let green = 0;
  let blue = 0;
  let total = 0;

  for (let y = 0; y < size; y += 4) {
    for (let x = 0; x < size; x += 4) {
      const index = (y * size + x) * 4;
      const alpha = pixels[index + 3] / 255;
      if (alpha < 0.5) continue;

      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const [hue, saturation, lightness] = rgbToHsl(r, g, b);
      if (lightness < 0.12 || lightness > 0.88 || saturation < 0.12) continue;

      const lightnessScore = 1 - Math.min(0.72, Math.abs(lightness - 0.5) * 1.8);
      const weight = alpha * (0.35 + saturation) * lightnessScore;
      const [sr, sg, sb] = hslToRgb(hue, clamp(saturation * 1.15, 0.42, 0.78), clamp(lightness, 0.34, 0.48));
      red += sr * weight;
      green += sg * weight;
      blue += sb * weight;
      total += weight;
    }
  }

  if (!total) return "#64748b";
  return rgbToHex(red / total, green / total, blue / total);
}

function rgbToHsl(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  if (max === r) hue = (g - b) / delta + (g < b ? 6 : 0);
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  return [hue / 6, saturation, lightness];
}

function hslToRgb(hue, saturation, lightness) {
  if (saturation === 0) {
    const value = Math.round(lightness * 255);
    return [value, value, value];
  }

  const hueToRgb = (p, q, t) => {
    let next = t;
    if (next < 0) next += 1;
    if (next > 1) next -= 1;
    if (next < 1 / 6) return p + (q - p) * 6 * next;
    if (next < 1 / 2) return q;
    if (next < 2 / 3) return p + (q - p) * (2 / 3 - next) * 6;
    return p;
  };

  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  return [
    Math.round(hueToRgb(p, q, hue + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, hue) * 255),
    Math.round(hueToRgb(p, q, hue - 1 / 3) * 255),
  ];
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue].map((value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function calculateBmi(weight, heightCm) {
  if (!isValidWeight(weight) || !isValidHeight(heightCm)) return 0;
  const heightMeters = heightCm / 100;
  return round1(weight / (heightMeters * heightMeters));
}

function getBmiCategory(bmi) {
  if (!bmi) {
    return {
      key: "missing",
      label: "待完善",
      range: "",
      summary: "补上身高后显示 BMI",
    };
  }
  return BMI_CATEGORIES.find((category) => bmi >= category.min && bmi < category.max) || BMI_CATEGORIES[BMI_CATEGORIES.length - 1];
}

function getBmiGaugePosition(bmi) {
  return clamp(((bmi - BMI_SCALE_MIN) / (BMI_SCALE_MAX - BMI_SCALE_MIN)) * 100, 0, 100);
}

function getBmiStatusColor(key) {
  if (key === "under") return "#456cf6";
  if (key === "over") return "#b8872d";
  if (key === "obese") return "#d84a5f";
  if (key === "normal") return "#1f7a5c";
  return "#9aa3ad";
}

function getHealthyWeightRange(heightCm) {
  if (!isValidHeight(heightCm)) return null;
  const heightMeters = heightCm / 100;
  return {
    min: round1(18.5 * heightMeters * heightMeters),
    max: round1(23.9 * heightMeters * heightMeters),
  };
}

function getSevenDayWeightTrend(participant, currentWeight) {
  if (!isValidWeight(currentWeight)) {
    return {
      value: "--",
      note: "记录后显示",
      tone: "neutral",
    };
  }

  const startDate = addDaysISO(getTodayISO(), -6);
  const startWeight = getWeightAtDate(participant, startDate);
  const delta = round1(currentWeight - startWeight);
  if (Math.abs(delta) < 0.05) {
    return {
      value: "持平",
      note: "近 7 天",
      tone: "neutral",
    };
  }

  return {
    value: delta < 0 ? `减 ${formatNumber(Math.abs(delta), 1)}kg` : `增 ${formatNumber(delta, 1)}kg`,
    note: "近 7 天",
    tone: delta < 0 ? "good" : "watch",
  };
}

function getHealthyWeightPosition(currentWeight, healthyRange) {
  if (!isValidWeight(currentWeight) || !healthyRange) {
    return {
      value: "待补",
      tone: "neutral",
    };
  }
  if (currentWeight < healthyRange.min) {
    return {
      value: `低 ${formatNumber(healthyRange.min - currentWeight, 1)}kg`,
      tone: "under",
    };
  }
  if (currentWeight > healthyRange.max) {
    return {
      value: `高 ${formatNumber(currentWeight - healthyRange.max, 1)}kg`,
      tone: "watch",
    };
  }
  return {
    value: "标准内",
    tone: "good",
  };
}

function isValidWeight(value) {
  return Number.isFinite(value) && value >= 30 && value <= 250;
}

function isValidHeight(value) {
  return Number.isFinite(value) && value >= 100 && value <= 230;
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

function addDaysISO(iso, offset) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const date = new Date(`${iso}T00:00:00+08:00`);
  date.setDate(date.getDate() + offset);
  return formatter.format(date);
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

function getBodyStatsText(participant, weight) {
  return `${getHeightText(participant)} · ${getBmiText(participant, weight)}`;
}

function getHeightText(participant) {
  if (!isValidHeight(participant?.heightCm)) return "身高待补";
  return `${formatCompactNumber(participant.heightCm, 1)}cm`;
}

function getBmiText(participant, weight) {
  const bmi = calculateBmi(weight, participant?.heightCm);
  return bmi ? `BMI ${formatNumber(bmi, 1)}` : "BMI 待补";
}

function formatMoney(value) {
  return Math.round(value).toLocaleString("zh-CN");
}

function formatNumber(value, digits) {
  return Number(value).toFixed(digits);
}

function formatCompactNumber(value, maxDigits) {
  return Number(value).toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDigits,
  });
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
