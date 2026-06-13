import Sidebar from './Sidebar';
import Header from './Header';
import './Layout.css';

const Layout = ({ children }) => {
  return (
    <div className="layout">
      <Sidebar />
      <div className="main-content">
        <Header />
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
