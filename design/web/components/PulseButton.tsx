import React from 'react';
export function PulseButton({children,onClick,disabled=false}:{children:React.ReactNode;onClick?:()=>void;disabled?:boolean}) {
 return <button disabled={disabled} onClick={onClick} className="pulse-button">{children}</button>;
}
