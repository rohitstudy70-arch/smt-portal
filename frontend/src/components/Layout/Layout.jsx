import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import './Layout.css';

const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const closeSidebar = () => setSidebarOpen(false);

  useEffect(() => {
    window.toggleCdbSidebar = toggleSidebar;
    window.closeCdbSidebar = closeSidebar;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && sidebarOpen) {
        closeSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      delete window.toggleCdbSidebar;
      delete window.closeCdbSidebar;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [sidebarOpen]);

  return (
    <div className={`layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
      {createPortal(
        <>
          <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
          {sidebarOpen && (
            <div 
              className="sidebar-overlay" 
              onClick={closeSidebar} 
              onTouchEnd={(e) => {
                e.preventDefault();
                closeSidebar();
              }}
              aria-hidden="true"
            />
          )}
        </>,
        document.body
      )}
      <div className="main-content">
        <Header toggleSidebar={toggleSidebar} />
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
