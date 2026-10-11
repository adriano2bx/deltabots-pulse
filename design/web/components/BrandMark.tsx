import React from 'react';
/** Production must include approved official vector asset; NEVER recreate symbol via CSS/text. */
export function BrandMark({size=32}:{size?:number}) {
  return <img src="/brand/approved/deltabots_symbol_8C1_master_white.svg"
    width={size} height={size} alt="DeltaBots" style={{objectFit:'contain'}}
    onError={(event)=>{event.currentTarget.style.visibility='hidden';}} />;
}
