import React, { useState } from "react";
import { Shield, Copy, Check, ExternalLink, HelpCircle } from "lucide-react";

interface PermissionErrorGuideProps {
  collectionPath: string | null;
  onDismiss: () => void;
}

const FIRESTORE_RULES_CODE = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Global Safety Net default catch-all: Deny everything by default
    match /{document=**} {
      allow read, write: if false;
    }

    // --- REUSABLE SECURITY PRIMITIVES & HELPERS ---
    function isSignedIn() {
      return request.auth != null;
    }

    function isValidId(id) {
      return id is string && id.size() <= 128;
    }

    // Returns true if the request is from the owner or a validated team member of that owner
    function isAuthorizedOwner(ownerId) {
      return ownerId == request.auth.uid || 
             (exists(/databases/\$(database)/documents/team/\$(request.auth.uid)) &&
              get(/databases/\$(database)/documents/team/\$(request.auth.uid)).data.ownerId == ownerId);
    }

    // --- ENTITY SCHEMA VALIDATION HELPERS ---
    function isValidSalon(data) {
      return data.name is string && data.name.size() > 0 && data.name.size() <= 128 &&
             data.address is string && data.address.size() >= 0 && data.address.size() <= 256 &&
             data.phone is string && data.phone.size() <= 32 &&
             data.hours is string && data.hours.size() <= 128 &&
             isAuthorizedOwner(data.ownerId);
    }

    function isValidCategory(data) {
      return data.name is string && data.name.size() > 0 && data.name.size() <= 128 &&
             isAuthorizedOwner(data.ownerId);
    }

    function isValidService(data) {
      return data.name is string && data.name.size() > 0 && data.name.size() <= 128 &&
             data.price is number && data.price >= 0 &&
             data.duration is number && data.duration > 0 &&
             data.categoryId is string &&
             (!('categoryName' in data) || (data.categoryName is string && data.categoryName.size() <= 128)) &&
             (!('salonIds' in data) || data.salonIds is list) &&
             isAuthorizedOwner(data.ownerId);
    }

    function isValidCustomer(data) {
      return data.name is string && data.name.size() > 0 && data.name.size() <= 128 &&
             data.phone is string && data.phone.size() <= 32 &&
             (!('email' in data) || (data.email is string && data.email.size() <= 128)) &&
             data.salonId is string &&
             (!('notes' in data) || (data.notes is string && data.notes.size() <= 1000)) &&
             isAuthorizedOwner(data.ownerId);
    }

    function isValidAppointment(data) {
      return data.customerId is string &&
             data.customerName is string && data.customerName.size() > 0 && data.customerName.size() <= 128 &&
             data.serviceId is string &&
             data.serviceName is string && data.serviceName.size() > 0 && data.serviceName.size() <= 128 &&
             data.salonId is string &&
             data.staffName is string && data.staffName.size() <= 128 &&
             data.date is string && data.date.size() <= 32 &&
             data.time is string && data.time.size() <= 32 &&
             data.duration is number && data.duration > 0 &&
             data.price is number && data.price >= 0 &&
             data.status in ['confirmed', 'pending', 'cancelled', 'completed'] &&
             isAuthorizedOwner(data.ownerId);
    }

    function isValidCustomPrice(data) {
      return data.customerId is string &&
             data.serviceId is string &&
             data.serviceName is string && data.serviceName.size() <= 128 &&
             data.price is number && data.price >= 0 &&
             isAuthorizedOwner(data.ownerId);
    }

    function isValidInventoryItem(data) {
      return data.name is string && data.name.size() > 0 && data.name.size() <= 128 &&
             data.category is string && data.category.size() > 0 && data.category.size() <= 128 &&
             data.quantity is number && data.quantity >= 0 &&
             data.minQuantity is number && data.minQuantity >= 0 &&
             data.price is number && data.price >= 0 &&
             (!('brand' in data) || (data.brand is string && data.brand.size() <= 128)) &&
             isAuthorizedOwner(data.ownerId);
    }

    function isValidTeamMember(data) {
      return data.name is string && data.name.size() > 0 && data.name.size() <= 128 &&
             data.role is string && data.role.size() > 0 && data.role.size() <= 128 &&
             (!('phone' in data) || (data.phone is string && data.phone.size() <= 32)) &&
             (!('email' in data) || (data.email is string && data.email.size() <= 128)) &&
             data.salonIds is list &&
             isAuthorizedOwner(data.ownerId);
    }

    // --- COLLECTION MATCH RULES WITH ABAC/RBAC SECURE QUERY CHECKS ---

    match /salons/{salonId} {
      allow read, list: if isSignedIn() && isAuthorizedOwner(resource.data.ownerId);
      allow create: if isSignedIn() && isValidId(salonId) && isValidSalon(request.resource.data);
      allow update: if isSignedIn() && isValidId(salonId) && isValidSalon(request.resource.data) && isAuthorizedOwner(resource.data.ownerId);
      allow delete: if isSignedIn() && isValidId(salonId) && isAuthorizedOwner(resource.data.ownerId);
    }

    match /categories/{categoryId} {
      allow read, list: if isSignedIn() && isAuthorizedOwner(resource.data.ownerId);
      allow create: if isSignedIn() && isValidId(categoryId) && isValidCategory(request.resource.data);
      allow update: if isSignedIn() && isValidId(categoryId) && isValidCategory(request.resource.data) && isAuthorizedOwner(resource.data.ownerId);
      allow delete: if isSignedIn() && isValidId(categoryId) && isAuthorizedOwner(resource.data.ownerId);
    }

    match /services/{serviceId} {
      allow read, list: if isSignedIn() && isAuthorizedOwner(resource.data.ownerId);
      allow create: if isSignedIn() && isValidId(serviceId) && isValidService(request.resource.data);
      allow update: if isSignedIn() && isValidId(serviceId) && isValidService(request.resource.data) && isAuthorizedOwner(resource.data.ownerId);
      allow delete: if isSignedIn() && isValidId(serviceId) && isAuthorizedOwner(resource.data.ownerId);
    }

    match /customers/{customerId} {
      allow read, list: if isSignedIn() && isAuthorizedOwner(resource.data.ownerId);
      allow create: if isSignedIn() && isValidId(customerId) && isValidCustomer(request.resource.data);
      allow update: if isSignedIn() && isValidId(customerId) && isValidCustomer(request.resource.data) && isAuthorizedOwner(resource.data.ownerId);
      allow delete: if isSignedIn() && isValidId(customerId) && isAuthorizedOwner(resource.data.ownerId);
    }

    match /appointments/{appointmentId} {
      allow read, list: if isSignedIn() && isAuthorizedOwner(resource.data.ownerId);
      allow create: if isSignedIn() && isValidId(appointmentId) && isValidAppointment(request.resource.data);
      allow update: if isSignedIn() && isValidId(appointmentId) && isValidAppointment(request.resource.data) && isAuthorizedOwner(resource.data.ownerId);
      allow delete: if isSignedIn() && isValidId(appointmentId) && isAuthorizedOwner(resource.data.ownerId);
    }

    match /custom_prices/{customPriceId} {
      allow read, list: if isSignedIn() && isAuthorizedOwner(resource.data.ownerId);
      allow create: if isSignedIn() && isValidId(customPriceId) && isValidCustomPrice(request.resource.data);
      allow update: if isSignedIn() && isValidId(customPriceId) && isValidCustomPrice(request.resource.data) && isAuthorizedOwner(resource.data.ownerId);
      allow delete: if isSignedIn() && isValidId(customPriceId) && isAuthorizedOwner(resource.data.ownerId);
    }

    match /inventory/{itemId} {
      allow read, list: if isSignedIn() && isAuthorizedOwner(resource.data.ownerId);
      allow create: if isSignedIn() && isValidId(itemId) && isValidInventoryItem(request.resource.data);
      allow update: if isSignedIn() && isValidId(itemId) && isValidInventoryItem(request.resource.data) && isAuthorizedOwner(resource.data.ownerId);
      allow delete: if isSignedIn() && isValidId(itemId) && isAuthorizedOwner(resource.data.ownerId);
    }

    match /team/{memberId} {
      allow read: if isSignedIn() && (
        memberId == request.auth.uid ||
        (request.auth.token.email != null && memberId == request.auth.token.email.lower()) ||
        (request.auth.token.email != null && request.auth.token.email.lower().endsWith('@gmail.com') && memberId == request.auth.token.email.lower().replace('@gmail.com', '@gmal.com')) ||
        (request.auth.token.email != null && request.auth.token.email.lower().endsWith('@gmal.com') && memberId == request.auth.token.email.lower().replace('@gmal.com', '@gmail.com')) ||
        resource == null || 
        isAuthorizedOwner(resource.data.ownerId) || 
        (resource.data.email != null && request.auth.token.email != null && (
          resource.data.email.lower() == request.auth.token.email.lower() ||
          (resource.data.email.lower().endsWith('@gmal.com') && request.auth.token.email.lower().endsWith('@gmail.com') && resource.data.email.lower() == request.auth.token.email.lower().replace('@gmail.com', '@gmal.com')) ||
          (resource.data.email.lower().endsWith('@gmail.com') && request.auth.token.email.lower().endsWith('@gmal.com') && resource.data.email.lower() == request.auth.token.email.lower().replace('@gmal.com', '@gmail.com'))
        ))
      );
      allow list: if isSignedIn() && (
        isAuthorizedOwner(resource.data.ownerId) || 
        (resource != null && 'email' in resource.data && resource.data.email != null && request.auth.token.email != null && (
          resource.data.email.lower() == request.auth.token.email.lower() ||
          (resource.data.email.lower().endsWith('@gmal.com') && request.auth.token.email.lower().endsWith('@gmail.com') && resource.data.email.lower() == request.auth.token.email.lower().replace('@gmail.com', '@gmal.com')) ||
          (resource.data.email.lower().endsWith('@gmail.com') && request.auth.token.email.lower().endsWith('@gmal.com') && resource.data.email.lower() == request.auth.token.email.lower().replace('@gmal.com', '@gmail.com'))
        )) || 
        memberId == request.auth.uid
      );
      allow create: if isSignedIn() && isValidId(memberId) && (
        isValidTeamMember(request.resource.data) ||
        (
          memberId == request.auth.uid &&
          request.resource.data.email != null &&
          request.auth.token.email != null &&
          (
            request.resource.data.email.lower() == request.auth.token.email.lower() ||
            (request.resource.data.email.lower().endsWith('@gmal.com') && request.auth.token.email.lower().endsWith('@gmail.com') && request.resource.data.email.lower() == request.auth.token.email.lower().replace('@gmail.com', '@gmal.com')) ||
            (request.resource.data.email.lower().endsWith('@gmail.com') && request.auth.token.email.lower().endsWith('@gmal.com') && request.resource.data.email.lower() == request.auth.token.email.lower().replace('@gmal.com', '@gmail.com'))
          )
        )
      );
      allow update: if isSignedIn() && isValidId(memberId) && (
        (isValidTeamMember(request.resource.data) && isAuthorizedOwner(resource.data.ownerId)) ||
        (
          memberId == request.auth.uid &&
          request.resource.data.email != null &&
          request.auth.token.email != null &&
          (
            request.resource.data.email.lower() == request.auth.token.email.lower() ||
            (request.resource.data.email.lower().endsWith('@gmal.com') && request.auth.token.email.lower().endsWith('@gmail.com') && request.resource.data.email.lower() == request.auth.token.email.lower().replace('@gmail.com', '@gmal.com')) ||
            (request.resource.data.email.lower().endsWith('@gmail.com') && request.auth.token.email.lower().endsWith('@gmal.com') && request.resource.data.email.lower() == request.auth.token.email.lower().replace('@gmal.com', '@gmail.com'))
          )
        )
      );
      allow delete: if isSignedIn() && isValidId(memberId) && isAuthorizedOwner(resource.data.ownerId);
    }

  }
}`;

export default function PermissionErrorGuide({ collectionPath, onDismiss }: PermissionErrorGuideProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(FIRESTORE_RULES_CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Failed to copy rules:", err);
    }
  };

  return (
    <div className="bg-white border-2 border-amber-200 rounded-3xl p-6 md:p-8 shadow-xl shadow-amber-100/40 max-w-3xl mx-auto my-6 animate-fadeIn">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
          <Shield className="w-6 h-6" />
        </div>
        <div className="space-y-2 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Richiesta Azione: Firestore Rules
            </span>
            <span className="text-xs text-gray-400 font-mono">
              Origine: /api/{collectionPath || "appointments"}
            </span>
          </div>
          <h3 className="font-serif text-xl font-bold text-[#1a2035] leading-tight">
            Configura le regole di sicurezza nel tuo Firebase Console
          </h3>
          <p className="text-gray-600 text-sm leading-relaxed">
            Il database di Firestore ha bloccato la richiesta di lettura o scrittura della collezione{" "}
            <span className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
              {collectionPath || "generale"}
            </span>{" "}
            perché le regole di sicurezza attuali sul server Firebase non sono ancora impostate o ne impediscono l'accesso.
          </p>
        </div>
      </div>

      <div className="mt-6 border-t border-gray-100 pt-6 space-y-4">
        <h4 className="font-bold text-xs text-gray-500 uppercase tracking-widest flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-[#1a3a8f]" /> Come risolvere in 3 semplici passaggi:
        </h4>
        
        <ol className="list-decimal pl-5 space-y-2.5 text-xs font-semibold text-gray-600">
          <li>
            Accedi al tuo{" "}
            <a 
              href="https://console.firebase.google.com/" 
              target="_blank" 
              referrerPolicy="no-referrer" 
              className="text-[#1a3a8f] inline-flex items-center gap-0.5 hover:underline font-bold"
            >
              Firebase Console <ExternalLink className="w-3 h-3" />
            </a>{" "}
            e apri il tuo progetto.
          </li>
          <li>
            Seleziona <span className="text-slate-800 font-bold">Firestore Database</span> a sinistra, vai sulla scheda <span className="text-slate-800 font-bold">Rules</span> (Regole).
          </li>
          <li>
            Cancella le regole preesistenti, incolla il blocco di codice sicuro in calce, e clicca su <span className="bg-[#1a3a8f] text-white px-2 py-0.5 rounded text-[10px] uppercase font-bold">Pubblica (Publish)</span>!
          </li>
        </ol>
      </div>

      {/* Rules Code Container */}
      <div className="mt-8 border border-gray-200 rounded-2xl overflow-hidden shadow-inner bg-gray-900 text-gray-300">
        <div className="bg-gray-800/80 px-6 py-3 border-b border-gray-800 flex justify-between items-center">
          <span className="font-mono text-xs text-gray-400 font-bold">firestore.rules</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs font-bold text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg active:scale-95 transition-all outline-none"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-400" />
                Regole Copiate!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copia Regole
              </>
            )}
          </button>
        </div>
        <pre className="p-5 font-mono text-xs leading-relaxed max-h-56 overflow-y-auto scrollbar-thin select-all">
          {FIRESTORE_RULES_CODE}
        </pre>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onDismiss}
          className="border border-amber-300 hover:bg-amber-50 text-amber-900 font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all outline-none cursor-pointer"
        >
          Nascondi Avviso
        </button>
        <button
          onClick={() => {
            onDismiss();
            window.location.reload();
          }}
          className="bg-[#1a3a8f] hover:bg-[#152f73] text-white font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all shadow-md active:scale-98 outline-none cursor-pointer"
        >
          Ricarica App 🔄
        </button>
      </div>
    </div>
  );
}
