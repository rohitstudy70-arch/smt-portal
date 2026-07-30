import { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import './Layout.css';

const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className={`layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      {sidebarOpen && (
        <div 
          className="sidebar-overlay" 
          onClick={closeSidebar} 
          onTouchEnd={closeSidebar}
          aria-hidden="true"
        />
      )}
      <div className="main-content">
        <Header toggleSidebar={() => setSidebarOpen((prev) => !prev)} />
        <div className="page-content">
          {children}
        </div>
        <footer className="footer">
          2026 &copy; Arshi Enterprises. All rights reserved.
        </footer>
      </div>
    </div>
  );
};

export default Layout;
