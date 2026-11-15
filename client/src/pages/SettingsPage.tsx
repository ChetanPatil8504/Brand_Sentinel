import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { Shield, User, Cpu, CheckCircle2, UserPlus, AlertCircle, Sparkles } from 'lucide-react';
import { UserRole } from '../types';

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'BRAND_ADMIN';

  // Admin user provisioning form state
  const [provName, setProvName] = useState('');
  const [provEmail, setProvEmail] = useState('');
  const [provPassword, setProvPassword] = useState('');
  const [provRole, setProvRole] = useState<UserRole>('HUMAN_REVIEWER');
  const [provLoading, setProvLoading] = useState(false);
  const [provSuccess, setProvSuccess] = useState<string | null>(null);
  const [provError, setProvError] = useState<string | null>(null);

  const handleAdminProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvSuccess(null);
    setProvError(null);

    if (provPassword.length < 8 || !/[a-zA-Z]/.test(provPassword) || !/[0-9]/.test(provPassword)) {
      setProvError('Password must be at least 8 characters long and contain both letters and numbers.');
      return;
    }

    setProvLoading(true);
    try {
      const res = await api.post('/auth/admin/users', {
        fullName: provName.trim(),
        email: provEmail.trim().toLowerCase(),
        password: provPassword,
        role: provRole
      });
      setProvSuccess(res.data.message || 'User successfully provisioned.');
      setProvName('');
      setProvEmail('');
      setProvPassword('');
    } catch (err: any) {
      setProvError(err.response?.data?.error || 'Failed to provision user.');
    } finally {
      setProvLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="pb-6 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Platform Settings & Profile</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage user identity, active enterprise workspace parameters, and AI governance engine settings.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: Profile Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex flex-col items-center text-center space-y-3">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.fullName}
                className="w-20 h-20 rounded-full border-2 border-brand-500 object-cover shadow-sm"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                <User className="w-8 h-8" />
              </div>
            )}
            <div>
              <h2 className="text-base font-bold text-slate-900">{user?.fullName}</h2>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200 uppercase">
              {user?.role?.replace(/_/g, ' ')}
            </span>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-2 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>Brand Workspace:</span>
              <strong className="text-slate-900">Vajra Sentinel</strong>
            </div>
            <div className="flex justify-between">
              <span>Security Tier:</span>
              <strong className="text-slate-900">Enterprise SOC2</strong>
            </div>
            <div className="flex justify-between">
              <span>Session Status:</span>
              <strong className="text-emerald-600">Authenticated (JWT)</strong>
            </div>
          </div>
        </div>

        {/* Right Columns: Engine & Workspace Configuration (2 cols) */}
        <div className="md:col-span-2 space-y-6">
          {/* Admin User Provisioning Module (Admin Only) */}
          {isAdmin && (
            <div className="bg-white rounded-xl border border-brand-200 shadow-xs p-6 space-y-4">
              <div className="flex items-center space-x-2 text-slate-900 border-b border-slate-100 pb-3">
                <UserPlus className="w-4 h-4 text-brand-600" />
                <h3 className="text-sm font-bold">Administrative User Provisioning</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200">
                  Admin Only
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Authorized Brand Administrators can provision privileged Human Reviewer and Administrator accounts directly.
              </p>

              {provSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{provSuccess}</span>
                </div>
              )}

              {provError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{provError}</span>
                </div>
              )}

              <form onSubmit={handleAdminProvision} className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 uppercase mb-1 text-[11px]">Full Name</label>
                    <input
                      type="text"
                      required
                      value={provName}
                      onChange={(e) => setProvName(e.target.value)}
                      placeholder="e.g. David Zhao"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 uppercase mb-1 text-[11px]">Corporate Email</label>
                    <input
                      type="email"
                      required
                      value={provEmail}
                      onChange={(e) => setProvEmail(e.target.value)}
                      placeholder="david.zhao@vajra.com"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 uppercase mb-1 text-[11px]">Temporary Password</label>
                    <input
                      type="password"
                      required
                      value={provPassword}
                      onChange={(e) => setProvPassword(e.target.value)}
                      placeholder="Min. 8 alphanumeric chars"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 uppercase mb-1 text-[11px]">Privileged Role</label>
                    <select
                      value={provRole}
                      onChange={(e) => setProvRole(e.target.value as UserRole)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs font-medium"
                    >
                      <option value="HUMAN_REVIEWER">Human Reviewer</option>
                      <option value="BRAND_ADMIN">Brand Administrator</option>
                      <option value="CONTENT_CREATOR">Content Creator</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={provLoading}
                    className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-bold shadow-xs disabled:opacity-50 transition-colors"
                  >
                    {provLoading ? 'Provisioning...' : 'Provision Privileged Account'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* AI Governance Engine Status */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-brand-600" />
              <span>AI Governance Engine Architecture</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-900">Deterministic Rule Engine</p>
                  <p className="text-slate-500 text-[11px]">
                    Prohibited terms regex matching, length constraints, required claim disclaimers.
                  </p>
                </div>
                <span className="flex items-center text-emerald-600 font-bold">
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Active
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-900">Retrieval-Augmented Brand Grounding</p>
                  <p className="text-slate-500 text-[11px]">
                    BM25 & Semantic cosine similarity lookup across active approved brand facts and voice rules.
                  </p>
                </div>
                <span className="flex items-center text-emerald-600 font-bold">
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Active
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-900">Factual Claim Discrepancy & Gap Detector</p>
                  <p className="text-slate-500 text-[11px]">
                    Identifies metric discrepancies and marks unverified statements with "Approved evidence not found".
                  </p>
                </div>
                <span className="flex items-center text-emerald-600 font-bold">
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Active
                </span>
              </div>
            </div>
          </div>

          {/* Core Mandate Banner */}
          <div className="bg-navy-900 text-white rounded-xl p-6 border border-slate-800 shadow-md space-y-2">
            <div className="flex items-center space-x-2 text-brand-400">
              <Shield className="w-5 h-5" />
              <h4 className="text-xs font-bold uppercase tracking-wider">Brand Sentinel Operating Standard</h4>
            </div>
            <p className="text-sm font-semibold text-slate-100">
              "EVERY PIECE OF CONTENT. ONE APPROVED BRAND TRUTH."
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Automated intelligence surfaces verified findings and suggests non-destructive revisions, while the final publication decision remains strictly under human reviewer stewardship.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
