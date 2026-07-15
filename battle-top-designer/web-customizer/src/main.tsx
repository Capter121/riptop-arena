import { createRoot } from 'react-dom/client';
import App from './App';
import { useCustomizer } from './store';

useCustomizer.getState().hydrate(window.location.search);
createRoot(document.getElementById('root')!).render(<App />);
