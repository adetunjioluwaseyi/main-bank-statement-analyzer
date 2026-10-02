'use client';

import React from 'react';
import { useAuth } from '@/context/auth-context';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Shield, LogOut, History, UserCheck, AlertTriangle, LogIn } from 'lucide-react';
import { toast } from 'sonner';

interface UserNavProps {
  onOpenAdmin?: () => void;
  onOpenHistory?: () => void;
  onOpenAuth?: () => void;
}

export function UserNav({ onOpenAdmin, onOpenHistory, onOpenAuth }: UserNavProps) {
  const { user, profile, loading, isAdmin, isSuspended, logoutUser } = useAuth();

  const handleSignOut = async () => {
    try {
      await logoutUser();
      toast.info('Signed out of your account');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-8 w-24 bg-muted animate-pulse rounded-md" />
      </div>
    );
  }

  const displayName = profile?.displayName || user?.displayName || 'Account';
  const emailAddress = user?.email || 'user@local.dev';
  const initials = displayName.substring(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-2.5">
      {isAdmin && (
        <Button
          id="admin-console-quick-btn"
          size="sm"
          variant="secondary"
          onClick={onOpenAdmin}
          className="h-8 gap-1.5 text-xs font-semibold bg-amber-500/15 text-amber-900 hover:bg-amber-500/25 border border-amber-500/30"
        >
          <Shield className="w-3.5 h-3.5 text-amber-600" />
          <span>Admin Console</span>
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            id="user-profile-menu-trigger"
            className="flex items-center gap-2 p-1 rounded-full hover:ring-2 hover:ring-primary/20 focus:outline-none transition-all"
          >
            <Avatar className="h-8 w-8 border border-border shadow-xs">
              <AvatarImage src={user?.photoURL || undefined} alt={displayName} />
              <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64 p-2" align="end">
          <DropdownMenuLabel className="font-normal px-2 py-1.5">
            <div className="flex flex-col space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold truncate leading-none">
                  {displayName}
                </p>
                {isAdmin && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 border-amber-300 font-medium">
                    Admin
                  </Badge>
                )}
                {isSuspended && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 font-medium">
                    Suspended
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{emailAddress}</p>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          {isSuspended && (
            <div className="m-1.5 p-2 bg-red-50 border border-red-200 rounded-md text-[11px] text-red-800 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
              <span>Your account is currently suspended. Upload permissions are restricted.</span>
            </div>
          )}

          <DropdownMenuGroup>
            {isAdmin && (
              <DropdownMenuItem
                id="menu-open-admin-console"
                onClick={onOpenAdmin}
                className="gap-2 cursor-pointer font-medium text-amber-900 focus:bg-amber-50"
              >
                <Shield className="w-4 h-4 text-amber-600" />
                <span>Admin Console</span>
              </DropdownMenuItem>
            )}

            <DropdownMenuItem
              id="menu-open-my-uploads"
              onClick={onOpenHistory}
              className="gap-2 cursor-pointer"
            >
              <History className="w-4 h-4 text-muted-foreground" />
              <span>Statement History</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            id="menu-logout-btn"
            onClick={handleSignOut}
            className="gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
