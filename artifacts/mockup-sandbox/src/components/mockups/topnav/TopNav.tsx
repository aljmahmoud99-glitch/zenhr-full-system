import { useState, useRef, useEffect } from 'react';

const useQuery = () => new URLSearchParams(window.location.search);

const GROUPS_EN = [
  {
    key: 'hr-core', icon: 'groups', label: 'HR Core',
    items: [
      { icon: 'work_history', label: 'Job Titles' },
      { icon: 'groups', label: 'Employees' },
      { icon: 'person_add', label: 'Pre-Employment' },
      { icon: 'gavel', label: 'Disciplinary' },
      { icon: 'logout', label: 'Resignations' },
      { icon: 'fact_check', label: 'Clearance' },
    ]
  },
  {
    key: 'emp-actions', icon: 'swap_horiz', label: 'Employee Actions',
    items: [
      { icon: 'swap_horiz', label: 'Career Movements' },
      { icon: 'payments', label: 'Salary Changes' },
      { icon: 'person_off', label: 'Employment Status' },
    ]
  },
  {
    key: 'time', icon: 'schedule', label: 'Time & Attendance',
    items: [
      { icon: 'schedule', label: 'Shifts' },
      { icon: 'fact_check', label: 'Attendance' },
      { icon: 'event_note', label: 'Leaves' },
      { icon: 'more_time', label: 'Overtime' },
      { icon: 'today', label: 'Holidays' },
    ]
  },
  {
    key: 'compliance', icon: 'verified_user', label: 'Compliance & Assets',
    items: [
      { icon: 'verified_user', label: 'Compliance' },
      { icon: 'folder_open', label: 'Documents' },
      { icon: 'inventory_2', label: 'Assets' },
    ]
  },
  {
    key: 'payroll', icon: 'receipt_long', label: 'Payroll',
    items: [
      { icon: 'payments', label: 'Salary Advances' },
      { icon: 'receipt_long', label: 'Payroll Runs' },
      { icon: 'tune', label: 'Salary Components' },
    ]
  },
  {
    key: 'admin', icon: 'admin_panel_settings', label: 'Administration',
    items: [
      { icon: 'description', label: 'Official Forms' },
      { icon: 'bar_chart', label: 'Reports' },
      { icon: 'account_tree', label: 'Org Structure' },
      { icon: 'admin_panel_settings', label: 'Roles & Permissions' },
      { icon: 'manage_accounts', label: 'Users' },
      { icon: 'settings', label: 'Settings' },
    ]
  },
];

const GROUPS_AR = [
  {
    key: 'hr-core', icon: 'groups', label: 'الموارد البشرية',
    items: [
      { icon: 'work_history', label: 'المسميات الوظيفية' },
      { icon: 'groups', label: 'الموظفون' },
      { icon: 'person_add', label: 'ما قبل التوظيف' },
      { icon: 'gavel', label: 'التأديب' },
      { icon: 'logout', label: 'الاستقالات' },
      { icon: 'fact_check', label: 'براءة الذمة' },
    ]
  },
  {
    key: 'emp-actions', icon: 'swap_horiz', label: 'حركات الموظفين',
    items: [
      { icon: 'swap_horiz', label: 'الحركات الوظيفية' },
      { icon: 'payments', label: 'تعديلات الرواتب' },
      { icon: 'person_off', label: 'حالة التوظيف' },
    ]
  },
  {
    key: 'time', icon: 'schedule', label: 'الوقت والحضور',
    items: [
      { icon: 'schedule', label: 'الورديات' },
      { icon: 'fact_check', label: 'الحضور والانصراف' },
      { icon: 'event_note', label: 'الإجازات' },
      { icon: 'more_time', label: 'العمل الإضافي' },
      { icon: 'today', label: 'العطل الرسمية' },
    ]
  },
  {
    key: 'compliance', icon: 'verified_user', label: 'الامتثال والأصول',
    items: [
      { icon: 'verified_user', label: 'الامتثال' },
      { icon: 'folder_open', label: 'الوثائق' },
      { icon: 'inventory_2', label: 'الأصول' },
    ]
  },
  {
    key: 'payroll', icon: 'receipt_long', label: 'الرواتب',
    items: [
      { icon: 'payments', label: 'السلف' },
      { icon: 'receipt_long', label: 'مسيرات الرواتب' },
      { icon: 'tune', label: 'مكونات الراتب' },
    ]
  },
  {
    key: 'admin', icon: 'admin_panel_settings', label: 'الإدارة',
    items: [
      { icon: 'description', label: 'النماذج الرسمية' },
      { icon: 'bar_chart', label: 'التقارير' },
      { icon: 'account_tree', label: 'الهيكل التنظيمي' },
      { icon: 'admin_panel_settings', label: 'الأدوار والصلاحيات' },
      { icon: 'manage_accounts', label: 'المستخدمون' },
      { icon: 'settings', label: 'الإعدادات' },
    ]
  },
];

const PRIMARY = '#2d9e6b';
const PRIMARY_DARK = '#1a5e3f';

function Icon({ name, size = 20, style }: { name: string; size?: number; style?: React.CSSProperties }) {
  return (
    <span className="material-icons" style={{ fontSize: size, lineHeight: 1, userSelect: 'none', ...style }}>
      {name}
    </span>
  );
}

interface NavGroup {
  key: string;
  icon: string;
  label: string;
  items: { icon: string; label: string }[];
}

function DesktopNav({ rtl, isMobile }: { rtl: boolean; isMobile?: boolean }) {
  const [activeGroup, setActiveGroup] = useState<string | null>('hr-core');
  const [mobileOpen, setMobileOpen] = useState(false);
  const groups: NavGroup[] = rtl ? GROUPS_AR : GROUPS_EN;
  const dir = rtl ? 'rtl' : 'ltr';
  const activeG = groups.find(g => g.key === activeGroup);

  return (
    <div dir={dir} style={{
      fontFamily: rtl ? "'Noto Kufi Arabic', 'Segoe UI', sans-serif" : "'Inter', 'Segoe UI', sans-serif",
      background: '#f1f5f2',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Google Material Icons */}
      <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Noto+Kufi+Arabic:wght@400;600;700;800&display=swap" rel="stylesheet" />

      {/* ─── STICKY TOPBAR ─── */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: '#fff',
        borderBottom: '1px solid rgba(20,33,28,0.08)',
        boxShadow: '0 2px 12px rgba(15,23,42,0.07)',
      }}>
        {/* Row 1 — Brand + Tools */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '0 20px',
          height: 60,
          flexDirection: rtl ? 'row-reverse' : 'row',
        }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexDirection: rtl ? 'row-reverse' : 'row', flexShrink: 0 }}>
            <div style={{
              width: 38, height: 38,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY_DARK} 100%)`,
              color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 18,
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(45,158,107,0.3)',
            }}>Z</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, textAlign: rtl ? 'right' : 'left' }}>
              <span style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', lineHeight: 1.1 }}>
                {rtl ? 'زين جو' : 'ZenJO'}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, color: PRIMARY, letterSpacing: rtl ? 0 : '0.06em', textTransform: rtl ? 'none' : 'uppercase' }}>
                {rtl ? 'نظام الموارد البشرية' : 'HRMS Platform'}
              </span>
            </div>
          </div>

          {/* Search (hidden on mobile) */}
          {!isMobile && (
            <div style={{
              flex: 1, maxWidth: 300,
              display: 'flex', alignItems: 'center', gap: 8,
              height: 38, paddingInline: 12,
              border: '1px solid rgba(20,33,28,0.12)',
              borderRadius: 12, background: '#f8faf9',
              flexDirection: rtl ? 'row-reverse' : 'row',
            }}>
              <Icon name="search" size={18} style={{ color: '#9ca3af' }} />
              <span style={{ fontSize: 13, color: '#9ca3af' }}>{rtl ? 'بحث...' : 'Search...'}</span>
            </div>
          )}

          {/* Tools */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexDirection: rtl ? 'row-reverse' : 'row', flexShrink: 0 }}>
            {/* Lang */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 2,
              padding: '3px 4px',
              border: '1px solid rgba(20,33,28,0.1)',
              borderRadius: 999, background: 'rgba(255,255,255,0.92)',
            }}>
              {(['ar', 'en'] as const).map(l => (
                <button key={l} style={{
                  minHeight: 26, paddingInline: 10,
                  borderRadius: 999, border: 'none',
                  background: (rtl ? 'ar' : 'en') === l ? PRIMARY : 'transparent',
                  color: (rtl ? 'ar' : 'en') === l ? '#fff' : '#6b7280',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}>{l === 'ar' ? 'ع' : 'EN'}</button>
              ))}
            </div>

            {/* Notif */}
            <button style={{
              position: 'relative', width: 38, height: 38,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid rgba(20,33,28,0.1)', borderRadius: 12,
              background: '#fff', cursor: 'pointer',
            }}>
              <Icon name="notifications" size={20} style={{ color: '#374151' }} />
              <span style={{
                position: 'absolute', top: -4, insetInlineEnd: -3,
                minWidth: 18, height: 18, padding: '0 4px',
                borderRadius: 999, background: '#ef5350',
                color: '#fff', fontSize: 10, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>3</span>
            </button>

            {/* User */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '3px 10px 3px 4px',
              border: '1px solid rgba(20,33,28,0.1)', borderRadius: 12,
              background: '#fff', cursor: 'pointer',
              flexDirection: rtl ? 'row-reverse' : 'row',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 999,
                background: `linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_DARK})`,
                color: '#fff', fontSize: 12, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>أ</div>
              <div style={{ display: 'grid', gap: 1, textAlign: rtl ? 'right' : 'left' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#111', whiteSpace: 'nowrap' }}>
                  {rtl ? 'أحمد الخالد' : 'Ahmed Al-Khaled'}
                </span>
                <span style={{ fontSize: 10, color: '#6b7280' }}>
                  {rtl ? 'مدير الموارد البشرية' : 'HR Admin'}
                </span>
              </div>
              <Icon name="expand_more" size={16} style={{ color: '#9ca3af' }} />
            </div>

            {/* Mobile hamburger (shown only in mobile variant) */}
            {isMobile && (
              <button onClick={() => setMobileOpen(o => !o)} style={{
                width: 38, height: 38,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid rgba(20,33,28,0.1)', borderRadius: 12,
                background: mobileOpen ? `rgba(${PRIMARY},0.1)` : '#fff', cursor: 'pointer',
              }}>
                <Icon name={mobileOpen ? 'close' : 'menu'} size={20} style={{ color: '#374151' }} />
              </button>
            )}
          </div>
        </div>

        {/* Row 2 — Navigation groups (desktop only) */}
        {!isMobile && (
          <div style={{
            background: PRIMARY,
            display: 'flex',
            alignItems: 'stretch',
            paddingInline: 20,
            gap: 2,
            flexDirection: rtl ? 'row-reverse' : 'row',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            position: 'relative',
          }}>
            {/* Dashboard direct link */}
            <button style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 14px',
              background: 'rgba(255,255,255,0.15)',
              border: 'none', borderRadius: '8px 8px 0 0',
              color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700,
              flexDirection: rtl ? 'row-reverse' : 'row',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              <Icon name="dashboard" size={18} style={{ color: 'rgba(255,255,255,0.9)' }} />
              {rtl ? 'لوحة التحكم' : 'Dashboard'}
            </button>

            {groups.map(group => (
              <div
                key={group.key}
                onMouseEnter={() => setActiveGroup(group.key)}
                onMouseLeave={() => setActiveGroup(null)}
                style={{ position: 'relative', display: 'flex', alignItems: 'stretch', flexShrink: 0 }}
              >
                <button style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '10px 14px',
                  background: activeGroup === group.key ? 'rgba(255,255,255,0.18)' : 'transparent',
                  border: 'none', borderRadius: '8px 8px 0 0',
                  color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  transition: 'background 150ms',
                  flexDirection: rtl ? 'row-reverse' : 'row',
                  whiteSpace: 'nowrap',
                }}>
                  <Icon name={group.icon} size={17} style={{ color: 'rgba(255,255,255,0.85)' }} />
                  {group.label}
                  <Icon name="expand_more" size={16} style={{
                    color: 'rgba(255,255,255,0.7)',
                    transform: activeGroup === group.key ? 'rotate(180deg)' : 'none',
                    transition: 'transform 200ms',
                  }} />
                </button>

                {/* Dropdown */}
                {activeGroup === group.key && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    [rtl ? 'right' : 'left']: 0,
                    minWidth: 220,
                    background: '#fff',
                    borderRadius: '0 12px 12px 12px',
                    boxShadow: '0 20px 40px rgba(15,23,42,0.14)',
                    border: '1px solid rgba(20,33,28,0.08)',
                    zIndex: 200,
                    padding: 6,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}>
                    {group.items.map(item => (
                      <button key={item.label} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 12px',
                        borderRadius: 10, border: 'none',
                        background: 'transparent',
                        color: '#374151', cursor: 'pointer',
                        fontSize: 13, fontWeight: 600,
                        textAlign: rtl ? 'right' : 'left',
                        flexDirection: rtl ? 'row-reverse' : 'row',
                        transition: 'background 120ms',
                      }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(45,158,107,0.08)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <Icon name={item.icon} size={18} style={{ color: PRIMARY, flexShrink: 0 }} />
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mobile Drawer */}
      {isMobile && mobileOpen && (
        <>
          <div onClick={() => setMobileOpen(false)} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 98,
          }} />
          <div dir={dir} style={{
            position: 'fixed',
            top: 0, bottom: 0,
            [rtl ? 'right' : 'left']: 0,
            width: 280,
            background: '#fff',
            zIndex: 99,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 0 40px rgba(0,0,0,0.2)',
            overflowY: 'auto',
          }}>
            {/* Drawer header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 18px',
              borderBottom: '1px solid rgba(20,33,28,0.08)',
              background: PRIMARY,
              flexDirection: rtl ? 'row-reverse' : 'row',
            }}>
              <span style={{ fontWeight: 800, fontSize: 18, color: '#fff' }}>{rtl ? 'القائمة' : 'Menu'}</span>
              <button onClick={() => setMobileOpen(false)} style={{
                border: 'none', background: 'rgba(255,255,255,0.15)',
                borderRadius: 10, width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}>
                <Icon name="close" size={20} style={{ color: '#fff' }} />
              </button>
            </div>

            {/* Dashboard */}
            <button style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 18px', border: 'none',
              background: 'rgba(45,158,107,0.08)',
              color: PRIMARY, cursor: 'pointer', fontSize: 14, fontWeight: 700,
              flexDirection: rtl ? 'row-reverse' : 'row',
              textAlign: rtl ? 'right' : 'left',
              borderBottom: '1px solid rgba(20,33,28,0.06)',
            }}>
              <Icon name="dashboard" size={20} style={{ color: PRIMARY }} />
              {rtl ? 'لوحة التحكم' : 'Dashboard'}
            </button>

            {/* Groups */}
            {groups.map(group => (
              <DrawerGroup key={group.key} group={group} rtl={rtl} primary={PRIMARY} />
            ))}

            {/* Logout */}
            <div style={{ marginTop: 'auto', padding: 12, borderTop: '1px solid rgba(20,33,28,0.08)' }}>
              <button style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 12, border: 'none',
                background: 'rgba(239,68,68,0.08)', color: '#dc2626',
                cursor: 'pointer', fontSize: 13, fontWeight: 700, width: '100%',
                flexDirection: rtl ? 'row-reverse' : 'row',
              }}>
                <Icon name="logout" size={18} style={{ color: '#dc2626' }} />
                {rtl ? 'تسجيل الخروج' : 'Logout'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Page content preview */}
      <div style={{ padding: 24, flex: 1 }}>
        <div style={{
          background: 'rgba(255,255,255,0.8)',
          borderRadius: 20, padding: 24, border: '1px solid rgba(20,33,28,0.08)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: PRIMARY, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {rtl ? 'إدارة الموظفين' : 'HR Core'}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
            {rtl ? 'قائمة الموظفين' : 'Employees'}
          </div>
          <div style={{ height: 2, width: 40, background: PRIMARY, borderRadius: 2 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 8 }}>
            {[
              { label: rtl ? 'إجمالي الموظفين' : 'Total Employees', value: '142' },
              { label: rtl ? 'موظفون نشطون' : 'Active', value: '138' },
              { label: rtl ? 'إجازة' : 'On Leave', value: '4' },
            ].map(kpi => (
              <div key={kpi.label} style={{
                padding: 16, borderRadius: 14,
                border: '1px solid rgba(20,33,28,0.08)',
                background: '#fff',
              }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{kpi.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: PRIMARY }}>{kpi.value}</div>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: 8, borderRadius: 12, border: '1px solid rgba(20,33,28,0.06)',
            overflow: 'hidden',
          }}>
            {[
              { name: rtl ? 'أحمد الخالد' : 'Ahmed Al-Khaled', role: rtl ? 'مدير تقنية' : 'IT Manager' },
              { name: rtl ? 'سارة المحمد' : 'Sara Al-Mohammed', role: rtl ? 'محاسبة' : 'Accountant' },
              { name: rtl ? 'ماجد العمري' : 'Majid Al-Omari', role: rtl ? 'مطور برمجيات' : 'Developer' },
            ].map((emp, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                background: i % 2 === 0 ? '#fafafa' : '#fff',
                borderBottom: i < 2 ? '1px solid rgba(20,33,28,0.05)' : 'none',
                flexDirection: rtl ? 'row-reverse' : 'row',
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 999,
                  background: `linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_DARK})`,
                  color: '#fff', fontSize: 13, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>{emp.name[0]}</div>
                <div style={{ flex: 1, textAlign: rtl ? 'right' : 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>{emp.name}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{emp.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DrawerGroup({ group, rtl, primary }: { group: NavGroup; rtl: boolean; primary: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid rgba(20,33,28,0.06)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 18px', border: 'none', background: 'transparent',
          color: '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 700, width: '100%',
          flexDirection: rtl ? 'row-reverse' : 'row',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexDirection: rtl ? 'row-reverse' : 'row' }}>
          <Icon name={group.icon} size={18} style={{ color: primary }} />
          {group.label}
        </div>
        <Icon name={open ? 'expand_less' : 'expand_more'} size={18} style={{ color: '#9ca3af' }} />
      </button>
      {open && (
        <div style={{ paddingBottom: 6 }}>
          {group.items.map(item => (
            <button key={item.label} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 24px', border: 'none',
              background: 'transparent', color: '#6b7280',
              cursor: 'pointer', fontSize: 13, fontWeight: 600, width: '100%',
              flexDirection: rtl ? 'row-reverse' : 'row',
              textAlign: rtl ? 'right' : 'left',
            }}>
              <Icon name={item.icon} size={16} style={{ color: primary, opacity: 0.75 }} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TopNav() {
  const q = useQuery();
  const mode = q.get('mode') || 'ltr';
  const rtl = mode === 'rtl';
  const mobile = mode === 'mobile';
  return <DesktopNav rtl={rtl} isMobile={mobile} />;
}
