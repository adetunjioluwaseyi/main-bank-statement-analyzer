"use client"

import { useState } from "react"
import {
  TrendingUp,
  FileText,
  Bell,
  LayoutDashboard,
  Users,
  ChevronDown,
  LogOut,
  Gift,
} from "lucide-react"
import { usePathname } from "next/navigation"

export function Sidebar({ currentPage }: { currentPage?: string }) {
  const pathname = usePathname()
  // Track only one expanded item at a time
  const [expandedItem, setExpandedItem] = useState<string | null>(null)

  const isDashboard = pathname === "/dashboard"

  const toggleExpand = (item: string) => {
    setExpandedItem((prev) => (prev === item ? null : item))
  }

  const isExpanded = (item: string) => expandedItem === item

  return (
    <aside className="hidden md:flex w-64 bg-muted border-r border-border p-6 flex-col h-screen"  style={{ backgroundImage: `url('/bg.png')` }} >
      {/* Logo */}
      <div className="flex items-center gap-2 mb-8">
        <img src="/adspire-logo.png" alt="MyRite Wallet Logo" className="h-10 w-auto" />
      </div>

      {/* Navigation */}
      <nav className="space-y-2 flex-1 overflow-y-auto">
        {/* Dashboard */}
        <a
          href="/dashboard"
          className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
            isDashboard
              ? "bg-gradient-to-br from-yellow-300 text-primary-foreground "
              : "text-white hover:text-foreground hover:bg-muted"
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="font-medium">All Activity</span>
        </a>

        {/* Wealth Rotation Dropdown */}
        <div>
          <button
            onClick={() => toggleExpand("wealth-rotation")}
            className={`w-full flex items-center justify-between px-4 py-2 rounded-lg transition-colors text-sm ${
              pathname.includes("wealth-rotation")
                ? "bg-gradient-to-br from-yellow-300  text-primary-foreground"
                : "text-white hover:text-dark hover:bg"
            }`}
          >
            <span className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5" />
              <span className="font-medium">Airtime & Bills </span>
            </span>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${
                isExpanded("wealth-rotation") ? "rotate-180" : ""
              }`}
            />
          </button>

          {isExpanded("wealth-rotation") && (
            <div className="space-y-1 mt-1 ml-2 pl-3 border-l border-muted">
              <a href="/wealth-rotation/overview" className="text-white block px-2 py-1 rounded hover:bg-muted">
                Overview
              </a>
              <a href="/wealth-rotation/daily" className="text-white block px-2 py-1 rounded hover:bg-muted">
                Daily Group
              </a>
              <a href="/wealth-rotation/weekly" className="text-white block px-2 py-1 rounded hover:bg-muted">
                Weekly Group
              </a>
              <a href="/wealth-rotation/monthly" className="text-white block px-2 py-1 rounded hover:bg-muted">
                Monthly Group
              </a>
            </div>
          )}
        </div>

        {/* SaveCave Dropdown */}
        <div>
          <button
            onClick={() => toggleExpand("save-cave")}
            className={`w-full flex items-center justify-between px-4 py-2 rounded-lg transition-colors text-sm ${
              pathname.includes("save-cave")
                ? "bg-gradient-to-br from-yellow-300 text-primary-foreground"
                : "text-white hover:text-foreground hover:bg-muted"
            }`}
          >
            <span className="flex items-center gap-3">
              <Gift className="w-5 h-5" />
              <span className="font-medium">Transfer</span>
            </span>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${
                isExpanded("save-cave") ? "rotate-180" : ""
              }`}
            />
          </button>

          {isExpanded("save-cave") && (
            <div className="space-y-1 mt-1 ml-2 pl-3 border-l border-muted">
              <a href="/save-cave/overview" className="text-xs block px-2 py-1 rounded hover:bg-muted">
                Overview
              </a>
              <a href="/save-cave/flexible-savings" className="text-white block px-2 py-1 rounded hover:bg-muted">
                Flexible Savings
              </a>
              <a href="/save-cave/target-achievers" className="text-white block px-2 py-1 rounded hover:bg-muted">
                Target Achievers
              </a>
              <a href="/save-cave/instant-access" className="text-white block px-2 py-1 rounded hover:bg-muted">
                Instant Access
              </a>
            </div>
          )}
        </div>

        

        

        <a
          href="/add-to-group"
          className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
            pathname.includes("add-to-group")
              ? "bg-gradient-to-br from-yellow-300 text-primary-foreground"
              : "text-white hover:text-foreground hover:bg-muted"
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="font-medium">Users</span>
        </a>

        <a
          href="/#add-to-group"
          className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
            pathname.includes("add-to-group")
              ? "bg-gradient-to-br from-yellow-300 text-primary-foreground"
              : "text-white hover:text-foreground hover:bg-muted"
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="font-medium">Reports</span>
        </a>
      </nav>

      {/* Sign Out */}
      <a
        href="/"
        className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <LogOut className="w-5 h-5" />
        <span className="font-medium">Sign Out</span>
      </a>
    </aside>
  )
}
