import { lazy, ReactNode, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { SkeletonRows } from "./components/Skeleton";
import type { Role } from "./api/types";

// every screen is its own chunk (6.3.1): trainees never download the dashboard, trainers never download MediaPipe glue
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Settings = lazy(() => import("./pages/Settings"));
const Home = lazy(() => import("./pages/trainee/Home"));
const Setup = lazy(() => import("./pages/trainee/Setup"));
const Live = lazy(() => import("./pages/trainee/Live"));
const Summary = lazy(() => import("./pages/trainee/Summary"));
const History = lazy(() => import("./pages/trainee/History"));
const MyReports = lazy(() => import("./pages/trainee/MyReports"));
const Dashboard = lazy(() => import("./pages/trainer/Dashboard"));
const TraineePage = lazy(() => import("./pages/trainer/TraineePage"));
const ReportPage = lazy(() => import("./pages/ReportPage"));
const Users = lazy(() => import("./pages/admin/Users"));
const Exercises = lazy(() => import("./pages/admin/Exercises"));
const Audit = lazy(() => import("./pages/admin/Audit"));
const Diag = lazy(() => import("./pages/Diag"));

function Guard({ roles, children, bare }: { roles?: Role[]; children: ReactNode; bare?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <SkeletonRows />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return bare ? <>{children}</> : <Layout>{children}</Layout>;
}

function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) return <SkeletonRows />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "Trainer") return <Navigate to="/trainer" replace />;
  if (user.role === "Admin") return <Navigate to="/admin/users" replace />;
  return (
    <Layout>
      <Home />
    </Layout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<SkeletonRows />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/diag" element={<Diag />} />
          <Route path="/" element={<HomeRoute />} />
          <Route path="/workout/setup" element={<Guard roles={["Trainee"]} bare><Setup /></Guard>} />
          <Route path="/workout/live" element={<Guard roles={["Trainee"]} bare><Live /></Guard>} />
          <Route path="/workout/summary/:localId" element={<Guard roles={["Trainee"]}><Summary /></Guard>} />
          <Route path="/history" element={<Guard roles={["Trainee"]}><History /></Guard>} />
          <Route path="/reports" element={<Guard roles={["Trainee"]}><MyReports /></Guard>} />
          <Route path="/reports/:id" element={<Guard roles={["Trainee", "Trainer"]}><ReportPage /></Guard>} />
          <Route path="/trainer" element={<Guard roles={["Trainer"]}><Dashboard /></Guard>} />
          <Route path="/trainer/trainees/:id" element={<Guard roles={["Trainer"]}><TraineePage /></Guard>} />
          <Route path="/admin/users" element={<Guard roles={["Admin"]}><Users /></Guard>} />
          <Route path="/admin/exercises" element={<Guard roles={["Admin"]}><Exercises /></Guard>} />
          <Route path="/admin/audit" element={<Guard roles={["Admin"]}><Audit /></Guard>} />
          <Route path="/settings" element={<Guard><Settings /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
