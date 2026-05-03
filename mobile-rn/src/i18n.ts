export type AppLanguage = "vi" | "en";

const dict = {
  vi: {
    auth_title: "Dang nhap",
    lobby_title: "Phong cho",
    call_title: "Cuoc goi",
    history_title: "Lich su",
    continue_guest: "Tiep tuc voi Guest",
    login: "Dang nhap",
    register: "Dang ky",
    create_room: "Tao phong",
    join_guest: "Vao voi Guest",
    local_tab: "Noi bo",
    cloud_tab: "Dam may",
    sync_cloud: "Dong bo cloud",
    rename: "Doi ten",
    app_language: "Ngon ngu ung dung",
    vietnamese: "Tieng Viet",
    english: "English"
  },
  en: {
    auth_title: "Sign In",
    lobby_title: "Lobby",
    call_title: "Call",
    history_title: "History",
    continue_guest: "Continue as Guest",
    login: "Login",
    register: "Register",
    create_room: "Create Room",
    join_guest: "Join as Guest",
    local_tab: "Local",
    cloud_tab: "Cloud",
    sync_cloud: "Sync Cloud",
    rename: "Rename",
    app_language: "App Language",
    vietnamese: "Vietnamese",
    english: "English"
  }
} as const;

type DictKey = keyof typeof dict.vi;

export function t(lang: AppLanguage, key: DictKey): string {
  return dict[lang][key] ?? dict.en[key];
}
