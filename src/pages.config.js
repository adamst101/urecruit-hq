import AdminImport from './pages/AdminImport';
import Calendar from './pages/Calendar';
import CampDetail from './pages/CampDetail';
import CampDetailDemo from './pages/CampDetailDemo';
import Discover from './pages/Discover';
import Home from './pages/Home';
import MyCamps from './pages/MyCamps';
import Onboarding from './pages/Onboarding';
import Profile from './pages/Profile';
import TestFunctions from './pages/TestFunctions';
import Checkout from './pages/Checkout';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminImport": AdminImport,
    "Calendar": Calendar,
    "CampDetail": CampDetail,
    "CampDetailDemo": CampDetailDemo,
    "Discover": Discover,
    "Home": Home,
    "MyCamps": MyCamps,
    "Onboarding": Onboarding,
    "Profile": Profile,
    "TestFunctions": TestFunctions,
    "Checkout": Checkout,
}

export const pagesConfig = {
    mainPage: "Onboarding",
    Pages: PAGES,
    Layout: __Layout,
};