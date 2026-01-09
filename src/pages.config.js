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
import Profile from './pages/Profile';
import Subscribe from './pages/Subscribe';
import TestFunctions from './pages/TestFunctions';
import Upgrade from './pages/Upgrade';
import Index from './pages/Index';
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
    "Profile": Profile,
    "Subscribe": Subscribe,
    "TestFunctions": TestFunctions,
    "Upgrade": Upgrade,
    "Index": Index,
}

export const pagesConfig = {
    mainPage: "Upgrade",
    Pages: PAGES,
    Layout: __Layout,
};