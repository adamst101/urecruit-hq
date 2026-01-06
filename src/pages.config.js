import AdminImport from './pages/AdminImport';
import Calendar from './pages/Calendar';
import CampDetail from './pages/CampDetail';
import CampDetailDemo from './pages/CampDetailDemo';
import Checkout from './pages/Checkout';
import DemoSetup from './pages/DemoSetup';
import Discover from './pages/Discover';
import Home from './pages/Home';
import LogoutDebug from './pages/LogoutDebug';
import MyCamps from './pages/MyCamps';
import Onboarding from './pages/Onboarding';
import Profile from './pages/Profile';
import Subscribe from './pages/Subscribe';
import TestFunctions from './pages/TestFunctions';
import Upgrade from './pages/Upgrade';
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
    "LogoutDebug": LogoutDebug,
    "MyCamps": MyCamps,
    "Onboarding": Onboarding,
    "Profile": Profile,
    "Subscribe": Subscribe,
    "TestFunctions": TestFunctions,
    "Upgrade": Upgrade,
}

export const pagesConfig = {
    mainPage: "Onboarding",
    Pages: PAGES,
    Layout: __Layout,
};