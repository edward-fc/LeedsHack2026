import { AppProvider } from './state/AppStore';
import { MainLayout } from './ui/layouts/MainLayout';

function App() {
    return (
        <AppProvider>
            <MainLayout />
        </AppProvider>
    );
}

export default App;
