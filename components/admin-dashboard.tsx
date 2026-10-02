'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth, UserProfile } from '@/context/auth-context';
import {
  fetchAllUsers,
  fetchAllUploads,
  toggleUserSuspension,
  updateUserRole,
  deleteUserRecord,
  deleteUploadRecord,
  UploadRecord,
} from '@/lib/admin-service';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Users,
  FileSpreadsheet,
  Shield,
  ShieldAlert,
  UserX,
  UserCheck,
  Trash2,
  Search,
  RefreshCw,
  AlertCircle,
  FileText,
  Activity,
  ArrowUpDown,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

interface AdminDashboardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminDashboard({ open, onOpenChange }: AdminDashboardProps) {
  const { user: currentFirebaseUser, isAdmin } = useAuth();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [uploadSearch, setUploadSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'user' | 'admin'>('all');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const loadAdminData = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [allUsers, allUploads] = await Promise.all([
        fetchAllUsers().catch(() => []),
        fetchAllUploads().catch(() => []),
      ]);
      setUsers(allUsers || []);
      setUploads(allUploads || []);
    } catch (err) {
      console.error(err);
      toast.error('Could not load administrative data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && isAdmin) {
      loadAdminData();
    }
  }, [open, isAdmin]);

  // Handle Suspend/Unsuspend
  const handleToggleSuspend = async (u: UserProfile) => {
    if (u.uid === currentFirebaseUser?.uid) {
      toast.error('You cannot suspend your own account');
      return;
    }
    const newStatus = u.status === 'suspended' ? 'active' : 'suspended';
    setActionInProgress(u.uid);
    try {
      await toggleUserSuspension(u.uid, newStatus);
      setUsers((prev) =>
        prev.map((item) => (item.uid === u.uid ? { ...item, status: newStatus } : item))
      );
      toast.success(
        newStatus === 'suspended'
          ? `Suspended access for ${u.email}`
          : `Reactivated account for ${u.email}`
      );
    } catch (err) {
      console.error(err);
      toast.error('Failed to update user status');
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Role Toggle (admin <-> user)
  const handleToggleRole = async (u: UserProfile) => {
    if (u.uid === currentFirebaseUser?.uid) {
      toast.error('You cannot alter your own admin status');
      return;
    }
    const newRole = u.role === 'admin' ? 'user' : 'admin';
    setActionInProgress(u.uid);
    try {
      await updateUserRole(u.uid, newRole);
      setUsers((prev) =>
        prev.map((item) => (item.uid === u.uid ? { ...item, role: newRole } : item))
      );
      toast.success(`Updated ${u.email} to ${newRole}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update role');
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Delete User
  const handleDeleteUser = async (u: UserProfile) => {
    if (u.uid === currentFirebaseUser?.uid) {
      toast.error('You cannot delete your own account');
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete user record for ${u.email}?`)) {
      return;
    }
    setActionInProgress(u.uid);
    try {
      await deleteUserRecord(u.uid);
      setUsers((prev) => prev.filter((item) => item.uid !== u.uid));
      toast.success(`Deleted user record for ${u.email}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete user');
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Delete Upload
  const handleDeleteUpload = async (upload: UploadRecord) => {
    if (!window.confirm(`Delete upload record "${upload.fileName}"?`)) {
      return;
    }
    setActionInProgress(upload.id);
    try {
      await deleteUploadRecord(upload.id);
      setUploads((prev) => prev.filter((item) => item.id !== upload.id));
      toast.success(`Deleted statement record "${upload.fileName}"`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete upload record');
    } finally {
      setActionInProgress(null);
    }
  };

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.email?.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.displayName?.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.uid?.toLowerCase().includes(userSearch.toLowerCase());
      const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [users, userSearch, statusFilter, roleFilter]);

  // Filtered uploads
  const filteredUploads = useMemo(() => {
    return uploads.filter((item) => {
      return (
        item.fileName?.toLowerCase().includes(uploadSearch.toLowerCase()) ||
        item.userEmail?.toLowerCase().includes(uploadSearch.toLowerCase()) ||
        item.userName?.toLowerCase().includes(uploadSearch.toLowerCase())
      );
    });
  }, [uploads, uploadSearch]);

  const activeCount = users.filter((u) => u.status === 'active').length;
  const suspendedCount = users.filter((u) => u.status === 'suspended').length;
  const adminCount = users.filter((u) => u.role === 'admin').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between pb-4 border-b">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-600" />
              <DialogTitle className="text-xl font-bold tracking-tight">
                Admin Console
              </DialogTitle>
              <Badge variant="secondary" className="bg-amber-100 text-amber-900 border-amber-300">
                Authorized Admin
              </Badge>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Oversee registered Gmail users, monitor uploaded bank statements, and manage account permissions.
            </DialogDescription>
          </div>
          <Button
            id="admin-refresh-btn"
            variant="outline"
            size="sm"
            onClick={loadAdminData}
            disabled={loading}
            className="gap-2 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </DialogHeader>

        {/* Top Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3">
          <div className="p-3 bg-muted/40 rounded-lg border">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Total Users</span>
              <Users className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="text-xl font-bold mt-1">{users.length}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {adminCount} Admin{adminCount === 1 ? '' : 's'}
            </div>
          </div>

          <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-200/60">
            <div className="flex items-center justify-between text-emerald-800">
              <span className="text-xs font-medium">Active Accounts</span>
              <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-xl font-bold text-emerald-950 mt-1">{activeCount}</div>
            <div className="text-[10px] text-emerald-700 mt-0.5">Full upload privileges</div>
          </div>

          <div className="p-3 bg-red-50/50 rounded-lg border border-red-200/60">
            <div className="flex items-center justify-between text-red-800">
              <span className="text-xs font-medium">Suspended</span>
              <UserX className="w-3.5 h-3.5 text-red-600" />
            </div>
            <div className="text-xl font-bold text-red-950 mt-1">{suspendedCount}</div>
            <div className="text-[10px] text-red-700 mt-0.5">Restricted from uploads</div>
          </div>

          <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-200/60">
            <div className="flex items-center justify-between text-blue-800">
              <span className="text-xs font-medium">Bank Statements</span>
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="text-xl font-bold text-blue-950 mt-1">{uploads.length}</div>
            <div className="text-[10px] text-blue-700 mt-0.5">Analyzed & logged</div>
          </div>
        </div>

        {/* Tabs: Users & Uploads */}
        <Tabs defaultValue="users" className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between pb-2">
            <TabsList className="grid grid-cols-2 w-64">
              <TabsTrigger value="users" className="text-xs gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Users ({users.length})
              </TabsTrigger>
              <TabsTrigger value="uploads" className="text-xs gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Uploads ({uploads.length})
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Users Tab Content */}
          <TabsContent value="users" className="flex-1 flex flex-col min-h-0 space-y-3 m-0">
            {/* Search & Filter Bar */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="admin-user-search-input"
                  placeholder="Search user by email or name..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Status:</span>
                <div className="flex rounded-md border p-0.5 bg-muted/40">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${
                      statusFilter === 'all' ? 'bg-background font-semibold shadow-xs' : 'text-muted-foreground'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setStatusFilter('active')}
                    className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${
                      statusFilter === 'active' ? 'bg-background text-emerald-700 font-semibold shadow-xs' : 'text-muted-foreground'
                    }`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setStatusFilter('suspended')}
                    className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${
                      statusFilter === 'suspended' ? 'bg-background text-red-700 font-semibold shadow-xs' : 'text-muted-foreground'
                    }`}
                  >
                    Suspended
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Role:</span>
                <div className="flex rounded-md border p-0.5 bg-muted/40">
                  <button
                    onClick={() => setRoleFilter('all')}
                    className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${
                      roleFilter === 'all' ? 'bg-background font-semibold shadow-xs' : 'text-muted-foreground'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setRoleFilter('user')}
                    className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${
                      roleFilter === 'user' ? 'bg-background font-semibold shadow-xs' : 'text-muted-foreground'
                    }`}
                  >
                    Users
                  </button>
                  <button
                    onClick={() => setRoleFilter('admin')}
                    className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${
                      roleFilter === 'admin' ? 'bg-background text-amber-700 font-semibold shadow-xs' : 'text-muted-foreground'
                    }`}
                  >
                    Admins
                  </button>
                </div>
              </div>
            </div>

            {/* Users Table */}
            <div className="flex-1 overflow-auto border rounded-md">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-muted/50 text-muted-foreground sticky top-0 border-b">
                  <tr>
                    <th className="p-2.5 font-semibold">User</th>
                    <th className="p-2.5 font-semibold">Role</th>
                    <th className="p-2.5 font-semibold">Status</th>
                    <th className="p-2.5 font-semibold text-center">Uploads</th>
                    <th className="p-2.5 font-semibold">Last Active</th>
                    <th className="p-2.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        No registered users found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isSelf = u.uid === currentFirebaseUser?.uid;
                      const isProcessing = actionInProgress === u.uid;

                      return (
                        <tr key={u.uid} className="hover:bg-muted/30 transition-colors">
                          <td className="p-2.5">
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-7 w-7">
                                <AvatarImage src={u.photoURL} />
                                <AvatarFallback className="text-[10px]">
                                  {(u.displayName || u.email || 'U').substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="truncate max-w-[200px]">
                                <p className="font-semibold text-foreground truncate leading-tight">
                                  {u.displayName || 'No Name'}
                                  {isSelf && (
                                    <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                                      (You)
                                    </span>
                                  )}
                                </p>
                                <p className="text-muted-foreground text-[11px] truncate">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-2.5">
                            {u.role === 'admin' ? (
                              <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-medium">
                                Admin
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                                User
                              </Badge>
                            )}
                          </td>
                          <td className="p-2.5">
                            {u.status === 'suspended' ? (
                              <Badge variant="destructive" className="text-[10px] font-medium">
                                Suspended
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] font-medium">
                                Active
                              </Badge>
                            )}
                          </td>
                          <td className="p-2.5 text-center font-medium">
                            {u.uploadedFilesCount || 0}
                          </td>
                          <td className="p-2.5 text-muted-foreground text-[11px]">
                            {u.lastActiveAt
                              ? new Date(u.lastActiveAt).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Never'}
                          </td>
                          <td className="p-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Suspend / Unsuspend Button */}
                              <Button
                                size="sm"
                                variant={u.status === 'suspended' ? 'outline' : 'secondary'}
                                disabled={isSelf || isProcessing}
                                onClick={() => handleToggleSuspend(u)}
                                className={`h-7 px-2 text-[11px] font-medium ${
                                  u.status === 'suspended'
                                    ? 'text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                                    : 'text-amber-800 hover:bg-amber-100'
                                }`}
                              >
                                {u.status === 'suspended' ? (
                                  <>
                                    <UserCheck className="w-3 h-3 mr-1" />
                                    Activate
                                  </>
                                ) : (
                                  <>
                                    <UserX className="w-3 h-3 mr-1" />
                                    Suspend
                                  </>
                                )}
                              </Button>

                              {/* Promote / Demote Role */}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isSelf || isProcessing}
                                onClick={() => handleToggleRole(u)}
                                className="h-7 px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                              >
                                {u.role === 'admin' ? 'Make User' : 'Make Admin'}
                              </Button>

                              {/* Delete User */}
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={isSelf || isProcessing}
                                onClick={() => handleDeleteUser(u)}
                                className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                title="Delete user record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* Uploads Tab Content */}
          <TabsContent value="uploads" className="flex-1 flex flex-col min-h-0 space-y-3 m-0">
            <div className="flex items-center justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="admin-upload-search-input"
                  placeholder="Search file name or uploader..."
                  value={uploadSearch}
                  onChange={(e) => setUploadSearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <span className="text-xs text-muted-foreground">
                Showing {filteredUploads.length} statement records
              </span>
            </div>

            <div className="flex-1 overflow-auto border rounded-md">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-muted/50 text-muted-foreground sticky top-0 border-b">
                  <tr>
                    <th className="p-2.5 font-semibold">File Details</th>
                    <th className="p-2.5 font-semibold">Uploaded By</th>
                    <th className="p-2.5 font-semibold">Date & Time</th>
                    <th className="p-2.5 font-semibold">Closing Balance</th>
                    <th className="p-2.5 font-semibold">Net Cash Flow</th>
                    <th className="p-2.5 font-semibold text-center">Health Score</th>
                    <th className="p-2.5 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUploads.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">
                        No bank statements recorded yet.
                      </td>
                    </tr>
                  ) : (
                    filteredUploads.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-2.5">
                          <div className="flex items-center gap-2">
                            <FileSpreadsheet className="w-4 h-4 text-primary shrink-0" />
                            <div>
                              <p className="font-semibold text-foreground">{item.fileName}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {item.rowCount ? `${item.rowCount} transactions` : 'Analyzed file'} •{' '}
                                {item.fileSize ? `${Math.round(item.fileSize / 1024)} KB` : 'N/A'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-2.5">
                          <p className="font-medium text-foreground">{item.userName || 'User'}</p>
                          <p className="text-[10px] text-muted-foreground">{item.userEmail}</p>
                        </td>
                        <td className="p-2.5 text-muted-foreground text-[11px]">
                          {item.uploadedAt
                            ? new Date(item.uploadedAt).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'N/A'}
                        </td>
                        <td className="p-2.5 font-mono">
                          ${(item.closingBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-2.5 font-mono">
                          <span
                            className={
                              (item.netCashFlow || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'
                            }
                          >
                            {(item.netCashFlow || 0) >= 0 ? '+' : ''}$
                            {(item.netCashFlow || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="p-2.5 text-center">
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-mono ${
                              (item.healthScore || 0) >= 70
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : (item.healthScore || 0) >= 50
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : 'bg-red-50 text-red-800 border-red-300'
                            }`}
                          >
                            {item.healthScore ? `${item.healthScore}/100` : 'N/A'}
                          </Badge>
                        </td>
                        <td className="p-2.5 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteUpload(item)}
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Delete upload entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
