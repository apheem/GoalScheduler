import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import InputPage from './pages/InputPage';
import ReviewPage from './pages/ReviewPage';
import SchedulePage from './pages/SchedulePage';
import SetupPage from './pages/SetupPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<InputPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
