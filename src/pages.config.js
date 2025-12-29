import AdminImport from './pages/AdminImport';
import Calendar from './pages/Calendar';
import CampDetail from './pages/CampDetail';
import Discover from './pages/Discover';
import MyCamps from './pages/MyCamps';
import Onboarding from './pages/Onboarding';
import Profile from './pages/Profile';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminImport": AdminImport,
    "Calendar": Calendar,
    "CampDetail": CampDetail,
    "Discover": Discover,
    "MyCamps": MyCamps,
    "Onboarding": Onboarding,
    "Profile": Profile,
}

export const pagesConfig = {
    mainPage: "Onboarding",
    Pages: PAGES,
    Layout: __Layout,
};