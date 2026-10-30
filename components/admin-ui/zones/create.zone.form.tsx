'use client'

import { Plus, AlertCircle } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner'
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Controller } from 'react-hook-form';
import { cn } from '@/lib/utils';

import {
  Sheet, SheetClose, SheetContent, SheetDescription,
  SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
  SelectValue, SelectGroup, SelectLabel,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Field, FieldDescription, FieldError, FieldGroup, FieldLabel,
} from "@/components/ui/field";
import { Separator } from '@/components/ui/separator';
import { ZoneFormValues, zoneFormSchema } from '@/lib/validation/zone.validation';
import { createZone, getAllBarangaysForSelect } from '@/lib/actions/zone.actions';

interface BarangayOption {
  barangay_id: string;
  barangay_name: string;
}

interface CreateZoneFormProps {
  onSuccess?: () => void;
  defaultBarangayId?: string;
}

const field = (err?: boolean) => cn(
  'w-full h-9 px-3 rounded-md text-[13px] text-slate-700',
  'bg-white border outline-none transition-all duration-150 placeholder:text-slate-300',
  err
    ? 'border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-100'
    : 'border-slate-200 hover:border-violet-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100',
)

function FieldLabelText({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
      {label}
      {required && <span className="text-rose-400 text-[11px] leading-none">*</span>}
    </label>
  )
}

function FieldErrorText({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="flex items-center gap-1 text-[10.5px] text-rose-500 mt-1">
      <AlertCircle className="h-3 w-3 shrink-0" />{message}
    </p>
  )
}

const CreateZoneForm = ({ onSuccess, defaultBarangayId }: CreateZoneFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [barangays, setBarangays] = useState<BarangayOption[]>([]);
  const [isLoadingBarangays, setIsLoadingBarangays] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<ZoneFormValues>({
    resolver: zodResolver(zoneFormSchema),
    defaultValues: {
      zone_name: '',
      barangay_id: defaultBarangayId ?? '',
    },
  });

  useEffect(() => {
    const fetchBarangays = async () => {
      if (!isOpen || defaultBarangayId) return;
      setIsLoadingBarangays(true);
      try {
        const data = await getAllBarangaysForSelect();
        setBarangays(data);
      } catch (err) {
        console.error('Error fetching barangays:', err);
        toast.error('Failed to load barangays');
      } finally {
        setIsLoadingBarangays(false);
      }
    };
    fetchBarangays();
  }, [isOpen, defaultBarangayId]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    setSubmitError(null);
    if (!open) {
      form.reset({ zone_name: '', barangay_id: defaultBarangayId ?? '' });
    }
  };

  const onSubmit = async (values: ZoneFormValues) => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createZone({
        zone_name: values.zone_name,
        barangay_id: defaultBarangayId ?? values.barangay_id,
      });

      if (result.status === 'success') {
        toast.success('Zone created successfully');
        setIsOpen(false);
        form.reset({ zone_name: '', barangay_id: defaultBarangayId ?? '' });
        onSuccess?.();
      } else {
        setSubmitError(result.message || 'Something went wrong');
      }
    } catch (err) {
      console.error('Submit error:', err);
      setSubmitError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button className="h-9 gap-2 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-semibold shadow-sm">
          <Plus className="h-4 w-4" />
          Add Zone
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-md flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
              <Plus className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <SheetTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                Add New Zone
              </SheetTitle>
              <SheetDescription className="text-[11px] text-slate-400 mt-0.5">
                Create a new zone in the system.
              </SheetDescription>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <form id="create-zone-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

            {/* Error Banner */}
            {submitError && (
              <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-md bg-rose-50 border border-rose-200">
                <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                <p className="text-xs font-medium text-rose-600">{submitError}</p>
              </div>
            )}

            {/* Zone Name */}
            <div>
              <FieldLabelText label="Zone Name" required />
              <Controller
                name="zone_name"
                control={form.control}
                render={({ field: controllerField, fieldState }) => (
                  <>
                    <Input
                      {...controllerField}
                      id="zone_name"
                      placeholder="Enter zone name"
                      className={field(!!fieldState.error)}
                    />
                    <FieldErrorText message={fieldState.error?.message} />
                  </>
                )}
              />
              <p className="text-[11px] text-slate-400 mt-1.5">Enter the name of the zone</p>
            </div>

            {/* Barangay Select - only show if no defaultBarangayId */}
            {!defaultBarangayId && (
              <div>
                <FieldLabelText label="Barangay" required />
                <Controller
                  name="barangay_id"
                  control={form.control}
                  render={({ field: controllerField, fieldState }) => (
                    <>
                      <Select
                        onValueChange={controllerField.onChange}
                        value={controllerField.value}
                        disabled={isLoadingBarangays}
                      >
                        <SelectTrigger className={field(!!fieldState.error)}>
                          <SelectValue placeholder="Select a barangay" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Barangays</SelectLabel>
                            {isLoadingBarangays ? (
                              <SelectItem value="loading" disabled>Loading barangays...</SelectItem>
                            ) : barangays.length === 0 ? (
                              <SelectItem value="empty" disabled>No barangays available</SelectItem>
                            ) : (
                              barangays.map((b) => (
                                <SelectItem key={b.barangay_id} value={b.barangay_id}>
                                  {b.barangay_name}
                                </SelectItem>
                              ))
                            )}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldErrorText message={fieldState.error?.message} />
                    </>
                  )}
                />
                <p className="text-[11px] text-slate-400 mt-1.5">Select the barangay this zone belongs to</p>
              </div>
            )}

            <Separator />

          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50/60">
          <SheetClose asChild>
            <Button
              type="button"
              variant="outline"
              className="rounded-md h-9 text-[13px] border-slate-200"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </SheetClose>
          <Button
            type="submit"
            form="create-zone-form"
            disabled={isSubmitting}
            className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white gap-1.5 font-medium"
          >
            {isSubmitting
              ? <><Spinner /> Creating…</>
              : <><Plus className="h-3.5 w-3.5" /> Create Zone</>
            }
          </Button>
        </div>

      </SheetContent>
    </Sheet>
  );
};

export default CreateZoneForm;