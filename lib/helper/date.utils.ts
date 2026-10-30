import { formatInTimeZone } from 'date-fns-tz';

const PH_TIMEZONE = 'Asia/Manila';

export function DateFormatPH(dateString: string) {

const date = new Date(
    Date.UTC(
        Number(dateString.slice(0, 4)),     
        Number(dateString.slice(5, 7)) - 1,  
        Number(dateString.slice(8, 10)),     
        Number(dateString.slice(11, 13)),    
        Number(dateString.slice(14, 16)),    
        Number(dateString.slice(17, 19))    
    )
);

  return formatInTimeZone(date, PH_TIMEZONE, 'MMM dd, yyyy • hh:mm a');
}