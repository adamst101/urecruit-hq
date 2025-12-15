import Onboarding from './pages/Onboarding';
import Discover from './pages/Discover';
import CampDetail from './pages/CampDetail';
import Calendar from './pages/Calendar';
import MyCamps from './pages/MyCamps';
import Profile from './pages/Profile';
import AdminImport from './pages/AdminImport';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Onboarding": Onboarding,
    "Discover": Discover,
    "CampDetail": CampDetail,
    "Calendar": Calendar,
    "MyCamps": MyCamps,
    "Profile": Profile,
    "AdminImport": AdminImport,
}

export const pagesConfig = {
    mainPage: "Onboarding",
    Pages: PAGES,
    Layout: __Layout,
};