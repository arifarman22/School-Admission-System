import { Outlet } from 'react-router';
import { useStudentId } from '../../hooks/useStudentId';
import { WelcomeScreen } from './WelcomeScreen';

export function StudentGate() {
  const { studentId } = useStudentId();
  return studentId ? <Outlet /> : <WelcomeScreen />;
}
