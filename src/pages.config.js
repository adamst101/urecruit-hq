/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AdminBackfill from './pages/AdminBackfill';
import AdminFactoryReset from './pages/AdminFactoryReset';
import AdminImport from './pages/AdminImport';
import AdminOps from './pages/AdminOps';
import AdminSeedSchoolLogos from './pages/AdminSeedSchoolLogos';
import AdminSeedSchoolsMaster from './pages/AdminSeedSchoolsMaster';
import AuthRedirect from './pages/AuthRedirect';
import Calendar from './pages/Calendar';
import CampDetail from './pages/CampDetail';
import CampDetailDemo from './pages/CampDetailDemo';
import Checkout from './pages/Checkout';
import DemoSetup from './pages/DemoSetup';
import Discover from './pages/Discover';
import Home from './pages/Home';
import Index from './pages/Index';
import LogoutDebug from './pages/LogoutDebug';
import MyCamps from './pages/MyCamps';
import Profile from './pages/Profile';
import SchoolAthleticsCleanup from './pages/SchoolAthleticsCleanup';
import Subscribe from './pages/Subscribe';
import TestFunctions from './pages/TestFunctions';
import Upgrade from './pages/Upgrade';
import UserNotRegisteredError from './pages/UserNotRegisteredError';
import Workspace from './pages/Workspace';
import SchoolsManager from './pages/SchoolsManager';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminBackfill": AdminBackfill,
    "AdminFactoryReset": AdminFactoryReset,
    "AdminImport": AdminImport,
    "AdminOps": AdminOps,
    "AdminSeedSchoolLogos": AdminSeedSchoolLogos,
    "AdminSeedSchoolsMaster": AdminSeedSchoolsMaster,
    "AuthRedirect": AuthRedirect,
    "Calendar": Calendar,
    "CampDetail": CampDetail,
    "CampDetailDemo": CampDetailDemo,
    "Checkout": Checkout,
    "DemoSetup": DemoSetup,
    "Discover": Discover,
    "Home": Home,
    "Index": Index,
    "LogoutDebug": LogoutDebug,
    "MyCamps": MyCamps,
    "Profile": Profile,
    "SchoolAthleticsCleanup": SchoolAthleticsCleanup,
    "Subscribe": Subscribe,
    "TestFunctions": TestFunctions,
    "Upgrade": Upgrade,
    "UserNotRegisteredError": UserNotRegisteredError,
    "Workspace": Workspace,
    "SchoolsManager": SchoolsManager,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};