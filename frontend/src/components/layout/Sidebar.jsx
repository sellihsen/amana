import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, Heart, BadgeDollarSign,
  TrendingDown, Settings, UserCog, BookOpen,
  FileSpreadsheet, Package, HandHeart,
} from 'lucide-react'
import RoleGuard from '../RoleGuard'
import { CAPACITES } from '../../utils/permissions'
import logoSrc from '../../assets/logo.jpeg'

const navItems = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/membres',     icon: Users,           label: 'Membres' },
  { to: '/dons',        icon: Heart,           label: 'Dons' },
  { to: '/cotisations', icon: BadgeDollarSign, label: 'Cotisations' },
  { to: '/depenses',    icon: TrendingDown,    label: 'Dépenses' },
  { to: '/rh',          icon: UserCog,         label: 'Ressources Humaines' },
  { to: '/stock',       icon: Package,         label: 'Gestion des Stocks' },
  { to: '/madrasa',     icon: BookOpen,        label: 'École Coranique' },
  { to: '/social',      icon: HandHeart,       label: 'Solidarité & Social' },
  { to: '/bilans',      icon: FileSpreadsheet, label: 'Comptabilité & Bilans' },
]

export default function Sidebar() {
  return (
    <aside className="w-64 bg-amana-800 text-white flex flex-col">
      {/* Logo & association */}
      <div className="flex flex-col items-center justify-center text-center px-4 py-6 border-b border-amana-700">
        <img src={logoSrc} alt="Logo" className="w-24 h-24 rounded-full object-cover ring-2 ring-amana-500 mb-3" />
        <p className="font-bold text-xl leading-tight text-white">ACMCM</p>
        <p className="text-sm font-semibold text-emerald-400 leading-tight mt-1">Mosquée Bilal</p>
      </div>

      {/* Navigation principale */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-amana-600 text-white'
                  : 'text-amana-200 hover:bg-amana-700 hover:text-white'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Lien Administration — masqué faute de capacité ADMIN.
          Le serveur refuse de toute façon : ceci évite un 403 inutile. */}
      <RoleGuard capacite={CAPACITES.ADMIN}>
        <div className="px-3 pb-3 border-t border-amana-700 pt-3">
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-amana-600 text-white'
                  : 'text-amana-300 hover:bg-amana-700 hover:text-white'
              }`
            }
          >
            <Settings className="w-5 h-5" />
            Administration
          </NavLink>
        </div>
      </RoleGuard>

      {/* Version */}
      <div className="px-6 py-3 border-t border-amana-700">
        <p className="text-xs text-amana-400">v1.4.0</p>
      </div>
    </aside>
  )
}
