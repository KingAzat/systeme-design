/**
 * SystemLab — Registre d'icônes partagé.
 * Le catalogue référence les icônes par nom (PascalCase Lucide).
 * Cette table mappe les noms vers les composants React sans importer
 * l'intégralité de lucide-react (tree-shaking).
 */
import {
  Activity, Archive, ArrowLeftRight, ArrowRight, ArrowUpDown, Award,
  Banknote, Bell, BellRing, Binary, Bird, Bot, Box, Boxes, Braces, Brain,
  Briefcase, Cable, CalendarClock, ChartColumn, ChartLine, ChartSpline,
  Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown,
  Circle, CircleCheck, CircleDot, CircleHelp, CircleX, Clock, Cloud,
  CloudCog, CloudUpload, Coins, Command, Compass, Container, Copy, Cpu,
  CreditCard, Crown, Database, DatabaseBackup, DatabaseZap, Ellipsis,
  EllipsisVertical, Eye, FileClock, FileJson, FileLock, FileSearch,
  FileStack, FileText, Filter, Fingerprint, Flame, FlaskConical, Folder,
  FolderOpen, Gauge, GitBranch, GitCompare, GitMerge, GitPullRequest,
  Globe, Globe2, GraduationCap, Grid2x2, Grid3x3, Grip, GripVertical,
  Handshake, HardDrive, HeartPulse, HelpCircle, History, Home, Hourglass,
  Inbox, Info, KeyRound, KeySquare, Landmark, LayoutGrid, Layers,
  LifeBuoy, Lightbulb, Link2, Link2Off, ListChecks, ListTodo, Lock,
  LockKeyhole, Mail, Map, MapPin, Maximize, MemoryStick, MessageSquare,
  MessagesSquare, Milestone, Minimize, Minus, Monitor, MonitorSmartphone,
  MoreHorizontal, MousePointerClick, MousePointer2, Network, NotebookPen,
  Package, PackageSearch, PanelBottom, PanelLeft, PanelRight, Pause, Pencil,
  PersonStanding, Play, Plug, Plus, Radar, Radio, Rabbit, RefreshCw, Repeat,
  Rocket, RotateCcw, Route, Save, Scale, ScanFace, Search, Send, Server,
  ServerCog, Settings, Settings2, Share2, Shield, ShieldCheck, Signal,
  SignalHigh, Smartphone, Snowflake, Sparkles, Split, Square, SquareTerminal,
  Star, Store, Table2, Target, Terminal, Timer, ToggleLeft, TrendingDown,
  TrendingUp, Trash2, TriangleAlert, Unplug, User, UserCog, Users, Vault,
  Wallet, Webhook, Wifi, Workflow, X, Zap, ZoomIn, ZoomOut,
  type LucideIcon,
} from "lucide-react";

export const LUCIDE_ICONS: Record<string, LucideIcon> = {
  Activity, Archive, ArrowLeftRight, ArrowRight, ArrowUpDown, Award,
  Banknote, Bell, BellRing, Binary, Bird, Bot, Box, Boxes, Braces, Brain,
  Briefcase, Cable, CalendarClock, ChartColumn, ChartLine, ChartSpline,
  Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown,
  Circle, CircleCheck, CircleDot, CircleHelp, CircleX, Clock, Cloud,
  CloudCog, CloudUpload, Coins, Command, Compass, Container, Copy, Cpu,
  CreditCard, Crown, Database, DatabaseBackup, DatabaseZap, Ellipsis,
  EllipsisVertical, Eye, FileClock, FileJson, FileLock, FileSearch,
  FileStack, FileText, Filter, Fingerprint, Flame, FlaskConical, Folder,
  FolderOpen, Gauge, GitBranch, GitCompare, GitMerge, GitPullRequest,
  Globe, Globe2, GraduationCap, Grid2x2, Grid3x3, Grip, GripVertical,
  Handshake, HardDrive, HeartPulse, HelpCircle, History, Home, Hourglass,
  Inbox, Info, KeyRound, KeySquare, Landmark, LayoutGrid, Layers,
  LifeBuoy, Lightbulb, Link2, Link2Off, ListChecks, ListTodo, Lock,
  LockKeyhole, Mail, Map, MapPin, Maximize, MemoryStick, MessageSquare,
  MessagesSquare, Milestone, Minimize, Minus, Monitor, MonitorSmartphone,
  MoreHorizontal, MousePointerClick, MousePointer2, Network, NotebookPen,
  Package, PackageSearch, PanelBottom, PanelLeft, PanelRight, Pause, Pencil,
  PersonStanding, Play, Plug, Plus, Radar, Radio, Rabbit, RefreshCw, Repeat,
  Rocket, RotateCcw, Route, Save, Scale, ScanFace, Search, Send, Server,
  ServerCog, Settings, Settings2, Share2, Shield, ShieldCheck, Signal,
  SignalHigh, Smartphone, Snowflake, Sparkles, Split, Square, SquareTerminal,
  Star, Store, Table2, Target, Terminal, Timer, ToggleLeft, TrendingDown,
  TrendingUp, Trash2, TriangleAlert, Unplug, User, UserCog, Users, Vault,
  Wallet, Webhook, Wifi, Workflow, X, Zap, ZoomIn, ZoomOut,
};

/** Résout une icône du catalogue (fallback : Box). */
export function getIcon(name: string | undefined): LucideIcon {
  if (name && LUCIDE_ICONS[name]) return LUCIDE_ICONS[name];
  return Box;
}

/** Couleurs d'accent par catégorie de composant (classes Tailwind). */
export const CATEGORY_STYLES: Record<
  string,
  { icon: string; badge: string; ring: string }
> = {
  clients: { icon: "text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10", badge: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300", ring: "ring-indigo-200 dark:ring-indigo-500/30" },
  network: { icon: "text-sky-500 bg-sky-50 dark:bg-sky-500/10", badge: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300", ring: "ring-sky-200 dark:ring-sky-500/30" },
  compute: { icon: "text-violet-500 bg-violet-50 dark:bg-violet-500/10", badge: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300", ring: "ring-violet-200 dark:ring-violet-500/30" },
  sql: { icon: "text-blue-500 bg-blue-50 dark:bg-blue-500/10", badge: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300", ring: "ring-blue-200 dark:ring-blue-500/30" },
  nosql: { icon: "text-teal-500 bg-teal-50 dark:bg-teal-500/10", badge: "bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300", ring: "ring-teal-200 dark:ring-teal-500/30" },
  cache: { icon: "text-rose-500 bg-rose-50 dark:bg-rose-500/10", badge: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300", ring: "ring-rose-200 dark:ring-rose-500/30" },
  messaging: { icon: "text-amber-500 bg-amber-50 dark:bg-amber-500/10", badge: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300", ring: "ring-amber-200 dark:ring-amber-500/30" },
  storage: { icon: "text-slate-500 bg-slate-100 dark:bg-slate-500/10", badge: "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300", ring: "ring-slate-200 dark:ring-slate-500/30" },
  search: { icon: "text-pink-500 bg-pink-50 dark:bg-pink-500/10", badge: "bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-300", ring: "ring-pink-200 dark:ring-pink-500/30" },
  communication: { icon: "text-cyan-500 bg-cyan-50 dark:bg-cyan-500/10", badge: "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-300", ring: "ring-cyan-200 dark:ring-cyan-500/30" },
  security: { icon: "text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10", badge: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300", ring: "ring-emerald-200 dark:ring-emerald-500/30" },
  resilience: { icon: "text-orange-500 bg-orange-50 dark:bg-orange-500/10", badge: "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300", ring: "ring-orange-200 dark:ring-orange-500/30" },
  observability: { icon: "text-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-500/10", badge: "bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/10 dark:text-fuchsia-300", ring: "ring-fuchsia-200 dark:ring-fuchsia-500/30" },
  distributed: { icon: "text-purple-500 bg-purple-50 dark:bg-purple-500/10", badge: "bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-300", ring: "ring-purple-200 dark:ring-purple-500/30" },
  jobs: { icon: "text-lime-500 bg-lime-50 dark:bg-lime-500/10", badge: "bg-lime-50 text-lime-600 dark:bg-lime-500/10 dark:text-lime-300", ring: "ring-lime-200 dark:ring-lime-500/30" },
  ai: { icon: "text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10", badge: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300", ring: "ring-indigo-200 dark:ring-indigo-500/30" },
  business: { icon: "text-green-500 bg-green-50 dark:bg-green-500/10", badge: "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-300", ring: "ring-green-200 dark:ring-green-500/30" },
  infrastructure: { icon: "text-stone-500 bg-stone-100 dark:bg-stone-500/10", badge: "bg-stone-100 text-stone-600 dark:bg-stone-500/10 dark:text-stone-300", ring: "ring-stone-200 dark:ring-stone-500/30" },
};

export function getCategoryStyle(categoryId: string) {
  return (
    CATEGORY_STYLES[categoryId] ?? {
      icon: "text-slate-500 bg-slate-100 dark:bg-slate-500/10",
      badge: "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300",
      ring: "ring-slate-200 dark:ring-slate-500/30",
    }
  );
}
