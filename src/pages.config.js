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
import AdminFactoryReset from './pages/AdminFactoryReset';
import AdminOps from './pages/AdminOps';
import AdminSeedSchoolLogos from './pages/AdminSeedSchoolLogos';
import AdminSeedSchoolsMaster from './pages/AdminSeedSchoolsMaster';
import AuthRedirect from './pages/AuthRedirect';
import BackfillRyzerProgramName from './pages/BackfillRyzerProgramName';
import BlockListManager from './pages/BlockListManager';
import Calendar from './pages/Calendar';
import CampDetail from './pages/CampDetail';
import CampsManager from './pages/CampsManager';
import Checkout from './pages/Checkout';
import Discover from './pages/Discover';
import GenerateDemoCamps from './pages/GenerateDemoCamps';
import Home from './pages/Home';
import HostOrgMappingManager from './pages/HostOrgMappingManager';
import Index from './pages/Index';
import MyCamps from './pages/MyCamps';
import Profile from './pages/Profile';
import SchoolAthleticsCleanup from './pages/SchoolAthleticsCleanup';
import SchoolsManager from './pages/SchoolsManager';
import SportIngestConfigManager from './pages/SportIngestConfigManager';
import Subscribe from './pages/Subscribe';
import TestFunctions from './pages/TestFunctions';
import Upgrade from './pages/Upgrade';
import UserNotRegisteredError from './pages/UserNotRegisteredError';
import Workspace from './pages/Workspace';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminFactoryReset": AdminFactoryReset,
    "AdminOps": AdminOps,
    "AdminSeedSchoolLogos": AdminSeedSchoolLogos,
    "AdminSeedSchoolsMaster": AdminSeedSchoolsMaster,
    "AuthRedirect": AuthRedirect,
    "BackfillRyzerProgramName": BackfillRyzerProgramName,
    "BlockListManager": BlockListManager,
    "Calendar": Calendar,
    "CampDetail": CampDetail,
    "CampsManager": CampsManager,
    "Checkout": Checkout,
    "Discover": Discover,
    "GenerateDemoCamps": GenerateDemoCamps,
    "Home": Home,
    "HostOrgMappingManager": HostOrgMappingManager,
    "Index": Index,
    "MyCamps": MyCamps,
    "Profile": Profile,
    "SchoolAthleticsCleanup": SchoolAthleticsCleanup,
    "SchoolsManager": SchoolsManager,
    "SportIngestConfigManager": SportIngestConfigManager,
    "Subscribe": Subscribe,
    "TestFunctions": TestFunctions,
    "Upgrade": Upgrade,
    "UserNotRegisteredError": UserNotRegisteredError,
    "Workspace": Workspace,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};