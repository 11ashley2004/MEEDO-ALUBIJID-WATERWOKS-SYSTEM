// components/admin-ui/consumer-type-modal.tsx
'use client'

import React, { useState, useEffect } from 'react';
import { Gauge, Info } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface ConsumerTypeModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  consumer: {
    consumer_id: string;
    first_name: string;
    last_name: string;
    email: string;
    consumer_type: boolean; // true = Metered, false = Non-Metered
  } | null;
  onConfirm: () => void;
  isLoading?: boolean;
}

const ConsumerTypeModal: React.FC<ConsumerTypeModalProps> = ({
  isOpen,
  setIsOpen,
  consumer,
  onConfirm,
  isLoading = false,
}) => {
  const [confirmationText, setConfirmationText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setConfirmationText('');
      setError('');
    }
  }, [isOpen]);

  if (!consumer) return null;

  // If already Metered, this modal should not allow any action
  const isAlreadyMetered = consumer.consumer_type;
  const consumerName = `${consumer.first_name} ${consumer.last_name}`;

  const handleConfirm = () => {
    if (isAlreadyMetered) return;

    if (confirmationText.trim().toLowerCase() !== consumer.email.toLowerCase()) {
      setError('The email you entered does not match. Please try again.');
      return;
    }

    setError('');
    onConfirm();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmationText(e.target.value);
    if (error) setError('');
  };

  const isConfirmDisabled =
    isAlreadyMetered ||
    confirmationText.trim().toLowerCase() !== consumer.email.toLowerCase();

  // Already Metered — show info-only dialog
  if (isAlreadyMetered) {
    return (
      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-blue-600" />
              Consumer Already Metered
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <span>
                <span className="font-semibold">{consumerName}</span> is already set
                as <Badge className="bg-blue-100 text-blue-800 border-blue-200 mx-1">Metered</Badge>.
                <span className="mt-3 p-3 border rounded-md flex items-start gap-2 bg-blue-50 border-blue-200 block">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-600" />
                  <span className="text-sm text-blue-800">
                    Once a consumer is set to <strong>Metered</strong>, this cannot be
                    reversed to Non-Metered. No changes have been made.
                  </span>
                </span>
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  // Non-Metered → Metered upgrade dialog
  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-blue-600" />
            Set Consumer as Metered
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <span>
              Are you sure you want to set{' '}
              <span className="font-semibold">{consumerName}</span> as Metered?

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
                  <span className="text-sm font-medium">Current Type:</span>
                  <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
                    Non-Metered
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
                  <span className="text-sm font-medium">New Type:</span>
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                    Metered
                  </Badge>
                </div>
              </div>

              <span className="mt-3 p-3 border rounded-md flex items-start gap-2 bg-amber-50 border-amber-200 block">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
                <span className="text-sm text-amber-800">
                  <strong>This action is irreversible.</strong> Once set to Metered, the
                  consumer cannot be changed back to Non-Metered.
                </span>
              </span>
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 my-2">
          <Label htmlFor="confirmation" className="text-sm font-medium">
            Type the consumer&apos;s email{' '}
            <span className="font-semibold">{consumer.email}</span> to confirm
          </Label>
          <Input
            id="confirmation"
            type="email"
            placeholder="Enter consumer email"
            value={confirmationText}
            onChange={handleInputChange}
            className={error ? 'border-destructive focus-visible:ring-destructive' : ''}
            disabled={isLoading}
            autoComplete="off"
          />
          {error && <p className="text-sm text-destructive mt-1">{error}</p>}
        </div>

        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={isLoading || isConfirmDisabled}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? (
              <>
                <Spinner className="mr-2 inline" />
                Processing...
              </>
            ) : (
              'Yes, Set as Metered'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ConsumerTypeModal;