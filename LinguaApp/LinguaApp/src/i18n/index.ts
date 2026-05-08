import { useMemo } from 'react';
import { useSettingsStore } from '../store/settingsStore';

type Locale = 'vi' | 'en';

const dict = {
  vi: {
    common_back: 'Quay lại',
    settings_title: 'Cài đặt',
    settings_account_title: 'Thông tin tài khoản',
    settings_account_sub: 'Xem hồ sơ và phiên đăng nhập',
    settings_language_menu: 'Ngôn ngữ & Dịch thuật',
    settings_version_menu: 'Phiên bản',
    settings_logout_menu: 'Đăng xuất',
    settings_logout_title: 'Đăng xuất',
    settings_logout_confirm: 'Bạn có chắc muốn đăng xuất?',
    settings_cancel: 'Hủy',
    language_title: 'Ngôn ngữ & Dịch thuật',
    language_my_language: 'NGÔN NGỮ CỦA BẠN',
    language_translation_settings: 'CÀI ĐẶT DỊCH THUẬT',
    language_auto_translate: 'Tự động dịch',
    language_auto_translate_sub: 'Dịch ngay khi nhận giọng nói',
    language_show_subtitle: 'Hiển thị phụ đề',
    language_show_subtitle_sub: 'Hiện transcript trong cuộc gọi',
    language_info: 'Ứng dụng chỉ hỗ trợ chuyển đổi giữa tiếng Việt và tiếng Anh. Bạn chỉ cần chọn ngôn ngữ của mình.',
    create_need_login_title: 'Cần đăng nhập',
    create_need_login_msg: 'Vui lòng đăng nhập lại để tạo phòng.',
    create_failed_title: 'Tạo phòng thất bại',
    create_title: 'Chọn ngôn ngữ của bạn',
    create_subtitle: 'Tạo phòng xong app sẽ vào màn gọi và hiển thị mã phòng để bạn gửi cho người kia.',
    create_button: 'Tạo phòng và vào ngay',
    join_need_login_title: 'Cần đăng nhập',
    join_need_login_msg: 'Vui lòng đăng nhập lại để vào phòng.',
    join_invalid_code_title: 'Thông báo',
    join_invalid_code_msg: 'Vui lòng nhập mã phòng 6 số.',
    join_failed_title: 'Vào phòng thất bại',
    join_enter_code: 'Nhập mã phòng',
    join_enter_code_sub: 'Mã phòng do host gửi sau khi tạo phòng.',
    join_room_code: 'Mã phòng',
    join_button: 'Vào phòng',
    login_email_required: 'Vui lòng nhập email',
    login_password_required: 'Vui lòng nhập mật khẩu',
    login_failed_title: 'Đăng nhập thất bại',
    guest_failed_title: 'Không thể vào chế độ khách',
    login_title_btn: 'Đăng nhập',
    login_no_account: 'Chưa có tài khoản?',
    login_register_now: 'Đăng ký ngay',
    login_guest_mode: 'Tiếp tục không đăng nhập',
  },
  en: {
    common_back: 'Back',
    settings_title: 'Settings',
    settings_account_title: 'Account Information',
    settings_account_sub: 'View profile and sign-in session',
    settings_language_menu: 'Language & Translation',
    settings_version_menu: 'Version',
    settings_logout_menu: 'Log out',
    settings_logout_title: 'Log out',
    settings_logout_confirm: 'Are you sure you want to log out?',
    settings_cancel: 'Cancel',
    language_title: 'Language & Translation',
    language_my_language: 'YOUR LANGUAGE',
    language_translation_settings: 'TRANSLATION SETTINGS',
    language_auto_translate: 'Auto translate',
    language_auto_translate_sub: 'Translate immediately after speech is received',
    language_show_subtitle: 'Show subtitles',
    language_show_subtitle_sub: 'Show transcript during calls',
    language_info: 'The app currently supports translation between Vietnamese and English only. Just select your own language.',
    create_need_login_title: 'Sign-in required',
    create_need_login_msg: 'Please sign in again to create a room.',
    create_failed_title: 'Create room failed',
    create_title: 'Choose your language',
    create_subtitle: 'After creating a room, the app enters the call screen and shows a room code to share.',
    create_button: 'Create room and enter now',
    join_need_login_title: 'Sign-in required',
    join_need_login_msg: 'Please sign in again to join a room.',
    join_invalid_code_title: 'Notice',
    join_invalid_code_msg: 'Please enter a 6-digit room code.',
    join_failed_title: 'Join room failed',
    join_enter_code: 'Enter room code',
    join_enter_code_sub: 'Use the room code shared by the host.',
    join_room_code: 'Room code',
    join_button: 'Join room',
    login_email_required: 'Please enter your email',
    login_password_required: 'Please enter your password',
    login_failed_title: 'Login failed',
    guest_failed_title: 'Cannot enter guest mode',
    login_title_btn: 'Log in',
    login_no_account: "Don't have an account?",
    login_register_now: 'Register now',
    login_guest_mode: 'Continue as guest',
  },
} as const;

type Key = keyof typeof dict.vi;

export function useI18n() {
  const myLang = useSettingsStore((s) => s.myLang);
  const locale: Locale = myLang === 'en' ? 'en' : 'vi';

  return useMemo(
    () => ({
      locale,
      t: (key: Key) => dict[locale][key] ?? dict.vi[key] ?? key,
    }),
    [locale]
  );
}

