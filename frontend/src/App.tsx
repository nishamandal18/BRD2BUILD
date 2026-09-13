import { useState } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import TopNavbar from '@/components/TopNavbar';
import DashboardPage from '@/pages/DashboardPage';
import BrdUploadPage from '@/pages/BrdUploadPage';
import UnitTestPage from '@/pages/UnitTestPage';
import DocsPage from '@/pages/DocsPage';
import HistoryPage from '@/pages/HistoryPage';
import SettingsPage from '@/pages/SettingsPage';
import type { PageId } from '@/lib/nav';

export default function App() {
  const [page, setPage] = useState<PageId>('dashboard');
  const [mobileNav, setMobileNav] = useState(false);
  const [, setSearch] = useState('');

  const navigate = (id: PageId) => {
    setPage(id);
    setMobileNav(false);
  };

  return (
    <div className="app-bg flex min-h-screen">
      <Sidebar
        active={page}
        onNavigate={navigate}
        mobileOpen={mobileNav}
        onCloseMobile={() => setMobileNav(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile menu button */}
        <div className="flex h-14 items-center px-4 lg:hidden">
          <button
            onClick={() => setMobileNav(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        <TopNavbar onSearch={setSearch} />

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div key={page} className="mx-auto max-w-7xl animate-fade-in">
            {page === 'dashboard' && <DashboardPage onNavigate={navigate} />}
            {page === 'brd' && <BrdUploadPage />}
            {page === 'tests' && <UnitTestPage />}
            {page === 'docs' && <DocsPage />}
            {page === 'history' && <HistoryPage />}
            {page === 'settings' && <SettingsPage />}
          </div>
        </main>
      </div>
    </div>
  );
}
