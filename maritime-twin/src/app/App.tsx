import { AppProvider } from './state/store';
import { MaritimeTwinPage } from './ui/pages/MaritimeTwinPage';

function App() {
    return (
        <AppProvider>
            <MaritimeTwinPage />
        </AppProvider>
    );
}

export default App;
