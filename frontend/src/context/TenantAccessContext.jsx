import React, { createContext, useContext } from 'react';

const TenantAccessContext = createContext({
  canAccessModule: () => false,
  levelOf: () => 'none',
  can: () => false,
  canRita: () => false,
  accessReady: false,
});

export function TenantAccessProvider({ value, children }) {
  return (
    <TenantAccessContext.Provider value={value}>
      {children}
    </TenantAccessContext.Provider>
  );
}

export function useTenantAccess() {
  return useContext(TenantAccessContext);
}
