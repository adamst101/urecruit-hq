import Home from './pages/Home';
import Onboarding from './pages/Onboarding';
import Discover from './pages/Discover';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Home": Home,
    "Onboarding": Onboarding,
    "Discover": Discover,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};