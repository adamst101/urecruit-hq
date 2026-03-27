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
import Account from './pages/Account';
import AppHealthCheck from './pages/AppHealthCheck';
import AdminFactoryReset from './pages/AdminFactoryReset';
import AdminOps from './pages/AdminOps';
import AdminSeedSchoolLogos from './pages/AdminSeedSchoolLogos';
import AdminSeedSchoolsMaster from './pages/AdminSeedSchoolsMaster';
import AthleteManager from './pages/AthleteManager';
import AuthRedirect from './pages/AuthRedirect';
import BackfillRyzerProgramName from './pages/BackfillRyzerProgramName';
import BlockListManager from './pages/BlockListManager';
import Calendar from './pages/Calendar';
import CampDetail from './pages/CampDetail';
import CampPlaybook from './pages/CampPlaybook';
import CampsManager from './pages/CampsManager';
import Checkout from './pages/Checkout';
import CheckoutSuccess from './pages/CheckoutSuccess';
import CoachDashboard from './pages/CoachDashboard';
import CoachProfile from './pages/CoachProfile';
import CoachNetworkAdmin from './pages/CoachNetworkAdmin';
import CoachInviteLanding from './pages/CoachInviteLanding';
import CoachSignup from './pages/CoachSignup';
import Discover from './pages/Discover';
import GenerateDemoCamps from './pages/GenerateDemoCamps';
import GeocodeSchools from './pages/GeocodeSchools';
import Home from './pages/Home';
import HostOrgMappingManager from './pages/HostOrgMappingManager';
import Index from './pages/Index';
import KnowledgeBase from './pages/KnowledgeBase';
import MonthlyAgendaAdmin from './pages/MonthlyAgendaAdmin';
import MyCamps from './pages/MyCamps';
import ProductMetrics from './pages/ProductMetrics';
import ProductRoadmap from './pages/ProductRoadmap';
import Profile from './pages/Profile';
import RecruitingGuide from './pages/RecruitingGuide';
import SchoolAthleticsCleanup from './pages/SchoolAthleticsCleanup';
import SchoolsManager from './pages/SchoolsManager';
import SeasonManager from './pages/SeasonManager';
import SportIngestConfigManager from './pages/SportIngestConfigManager';
import Signup from './pages/Signup';
import Subscribe from './pages/Subscribe';
import SupportDashboard from './pages/SupportDashboard';
import SupportReply from './pages/SupportReply';
import TestFunctions from './pages/TestFunctions';
import TermsOfService from './pages/TermsOfService';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Upgrade from './pages/Upgrade';
import UserNotRegisteredError from './pages/UserNotRegisteredError';
import Workspace from './pages/Workspace';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Account": Account,
    "AppHealthCheck": AppHealthCheck,
    "AdminFactoryReset": AdminFactoryReset,
    "AdminOps": AdminOps,
    "AdminSeedSchoolLogos": AdminSeedSchoolLogos,
    "AdminSeedSchoolsMaster": AdminSeedSchoolsMaster,
    "AthleteManager": AthleteManager,
    "AuthRedirect": AuthRedirect,
    "BackfillRyzerProgramName": BackfillRyzerProgramName,
    "BlockListManager": BlockListManager,
    "Calendar": Calendar,
    "CampDetail": CampDetail,
    "CampPlaybook": CampPlaybook,
    "CampsManager": CampsManager,
    "Checkout": Checkout,
    "CheckoutSuccess": CheckoutSuccess,
    "CoachDashboard": CoachDashboard,
    "CoachProfile": CoachProfile,
    "CoachNetworkAdmin": CoachNetworkAdmin,
    "CoachInviteLanding": CoachInviteLanding,
    "CoachSignup": CoachSignup,
    "Discover": Discover,
    "GenerateDemoCamps": GenerateDemoCamps,
    "GeocodeSchools": GeocodeSchools,
    "Home": Home,
    "HostOrgMappingManager": HostOrgMappingManager,
    "Index": Index,
    "KnowledgeBase": KnowledgeBase,
    "MonthlyAgendaAdmin": MonthlyAgendaAdmin,
    "MyCamps": MyCamps,
    "ProductMetrics": ProductMetrics,
    "ProductRoadmap": ProductRoadmap,
    "Profile": Profile,
    "RecruitingGuide": RecruitingGuide,
    "SchoolAthleticsCleanup": SchoolAthleticsCleanup,
    "SchoolsManager": SchoolsManager,
    "SeasonManager": SeasonManager,
    "SportIngestConfigManager": SportIngestConfigManager,
    "Signup": Signup,
    "Subscribe": Subscribe,
    "SupportDashboard": SupportDashboard,
    "SupportReply": SupportReply,
    "TestFunctions": TestFunctions,
    "TermsOfService": TermsOfService,
    "PrivacyPolicy": PrivacyPolicy,
    "Upgrade": Upgrade,
    "UserNotRegisteredError": UserNotRegisteredError,
    "Workspace": Workspace,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};