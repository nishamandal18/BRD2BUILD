export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

export interface JiraTicket {
  id: string;
  key: string;
  title: string;
  priority: Priority;
  storyPoints: number;
  assignee: string;
  description: string;
  acceptanceCriteria: string[];
}

export interface Epic {
  id: string;
  key: string;
  title: string;
  summary: string;
  storyCount: number;
}

export interface UserStory {
  id: string;
  key: string;
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  priority: Priority;
}

export const EPICS: Epic[] = [
  {
    id: 'e1',
    key: 'EPIC-01',
    title: 'User Authentication & Onboarding',
    summary:
      'Enable secure sign-up, login, and onboarding flows including SSO and role assignment.',
    storyCount: 6,
  },
  {
    id: 'e2',
    key: 'EPIC-02',
    title: 'Core Workflow Automation',
    summary:
      'Automate the primary business workflow from request intake to fulfillment with approvals.',
    storyCount: 9,
  },
  {
    id: 'e3',
    key: 'EPIC-03',
    title: 'Reporting & Analytics',
    summary:
      'Provide real-time dashboards, scheduled reports, and exportable insights for stakeholders.',
    storyCount: 5,
  },
];

export const USER_STORIES: UserStory[] = [
  {
    id: 'us1',
    key: 'US-01',
    title: 'SSO login with Google',
    asA: 'new user',
    iWant: 'to sign in with my Google account',
    soThat: 'I do not need to remember another password',
    priority: 'P1',
  },
  {
    id: 'us2',
    key: 'US-02',
    title: 'Role-based access control',
    asA: 'administrator',
    iWant: 'to assign roles to team members',
    soThat: 'they only see data relevant to their job',
    priority: 'P1',
  },
  {
    id: 'us3',
    key: 'US-03',
    title: 'Approval workflow',
    asA: 'manager',
    iWant: 'to approve requests in a single click',
    soThat: 'requests move forward without delay',
    priority: 'P2',
  },
];

export const JIRA_TICKETS: JiraTicket[] = [
  {
    id: 't1',
    key: 'TICKET-101',
    title: 'Implement Google OAuth2 sign-in flow',
    priority: 'P1',
    storyPoints: 5,
    assignee: 'A. Sharma',
    description:
      'Add a Google OAuth2 sign-in option to the login page using PKCE flow. Store refresh tokens securely and handle token expiry gracefully.',
    acceptanceCriteria: [
      'User sees a "Continue with Google" button on the login page',
      'Successful auth redirects to the dashboard',
      'Failed auth shows a non-blocking error message',
      'Refresh token is stored in an httpOnly cookie',
    ],
  },
  {
    id: 't2',
    key: 'TICKET-102',
    title: 'Role assignment screen for admins',
    priority: 'P2',
    storyPoints: 3,
    assignee: 'M. Chen',
    description:
      'Admins can assign and revoke roles (Viewer, Editor, Admin) for any team member from a dedicated settings screen.',
    acceptanceCriteria: [
      'Admin sees a list of all team members',
      'Roles can be changed via a dropdown',
      'Changes are persisted and reflected immediately',
      'Non-admins cannot access this screen',
    ],
  },
  {
    id: 't3',
    key: 'TICKET-103',
    title: 'One-click approval action',
    priority: 'P2',
    storyPoints: 2,
    assignee: 'J. Rivera',
    description:
      'Managers can approve a pending request from the requests queue without opening a detail view.',
    acceptanceCriteria: [
      'Approve button visible on each pending row',
      'Clicking approve updates status to Approved',
      'Audit log records approver and timestamp',
    ],
  },
  {
    id: 't4',
    key: 'TICKET-104',
    title: 'Scheduled report email delivery',
    priority: 'P3',
    storyPoints: 5,
    assignee: 'Unassigned',
    description:
      'Allow users to schedule a dashboard report to be emailed as a PDF on a daily or weekly cadence.',
    acceptanceCriteria: [
      'User picks frequency (daily/weekly)',
      'PDF is generated server-side and attached',
      'Email send failures are retried 3 times',
    ],
  },
];

export interface HistoryRow {
  id: string;
  date: string;
  project: string;
  feature: string;
  status: 'Completed' | 'Processing' | 'Failed';
}

export const HISTORY_ROWS: HistoryRow[] = [
  { id: 'h1', date: '2026-07-23 09:14', project: 'Atlas Payments', feature: 'BRD Upload', status: 'Completed' },
  { id: 'h2', date: '2026-07-23 08:02', project: 'Atlas Payments', feature: 'Unit Test Generator', status: 'Completed' },
  { id: 'h3', date: '2026-07-22 17:41', project: 'Nimbus CRM', feature: 'Documentation Generator', status: 'Processing' },
  { id: 'h4', date: '2026-07-22 15:20', project: 'Nimbus CRM', feature: 'Jira Generator', status: 'Completed' },
  { id: 'h5', date: '2026-07-21 11:05', project: 'Orbit Logistics', feature: 'BRD Upload', status: 'Failed' },
  { id: 'h6', date: '2026-07-21 10:10', project: 'Orbit Logistics', feature: 'Unit Test Generator', status: 'Completed' },
];

export interface ActivityItem {
  id: string;
  title: string;
  detail: string;
  time: string;
  type: 'brd' | 'tests' | 'docs' | 'jira';
}

export const RECENT_ACTIVITY: ActivityItem[] = [
  { id: 'a1', title: 'BRD analyzed', detail: 'Atlas Payments — 12 epics extracted', time: '2m ago', type: 'brd' },
  { id: 'a2', title: 'Unit tests generated', detail: 'payment_service.py — 87% coverage', time: '18m ago', type: 'tests' },
  { id: 'a3', title: 'Documentation published', detail: 'Nimbus CRM — README + API docs', time: '1h ago', type: 'docs' },
  { id: 'a4', title: 'Jira stories synced', detail: 'Orbit Logistics — 14 tickets to Jira', time: '3h ago', type: 'jira' },
];
