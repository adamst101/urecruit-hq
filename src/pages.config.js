import AdminImport from './pages/AdminImport';
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
import Subscribe from './pages/Subscribe';
import TestFunctions from './pages/TestFunctions';
import Upgrade from './pages/Upgrade';
import UserNotRegisteredError from './pages/UserNotRegisteredError';
import AuthRedirect from './pages/AuthRedirect';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminImport": AdminImport,
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
    "Subscribe": Subscribe,
    "TestFunctions": TestFunctions,
    "Upgrade": Upgrade,
    "UserNotRegisteredError": UserNotRegisteredError,
    "AuthRedirect": AuthRedirect,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};