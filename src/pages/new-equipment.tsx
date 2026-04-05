import { useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

const SUBMIT_TIMEOUT_MS = 30_000;

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  serialNumber: z.string().optional(),
  model: z.string().optional(),
  manufacturer: z.string().optional(),
  purchaseDate: z.string().optional(),
  location: z.string().optional(),
  folderId: z.string().optional(),
  maintenanceIntervalDays: z.coerce.number().optional(),
  imageUrl: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function NewEquipmentPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: folders } = useQuery({
    queryKey: ["/api/folders"],
    queryFn: api.folders.list,
  });

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const createMut = useMutation({
    mutationFn: ({ data, signal }: { data: Parameters<(typeof api.equipment)["create"]>[0]; signal: AbortSignal }) =>
      api.equipment.create(data, signal),
    onSuccess: (data) => {
      clearSubmitTimeout();
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast.success("Equipment added!");
      navigate(`/equipment/${data.id}`);
    },
    onError: (err: Error) => {
      clearSubmitTimeout();
      toast.error(err.message || "Failed to save equipment. Please try again.");
    },
    onSettled: () => {
      clearSubmitTimeout();
    },
  });

  function clearSubmitTimeout() {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current = null;
    }
  }

  const onSubmit = (data: FormValues) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    timeoutRef.current = setTimeout(() => {
      controller.abort();
      createMut.reset();
      toast.error("Request timed out. Please check your connection and try again.");
      abortRef.current = null;
      timeoutRef.current = null;
    }, SUBMIT_TIMEOUT_MS);

    createMut.mutate({
      data: { ...data, folderId: data.folderId === "none" ? undefined : data.folderId },
      signal: controller.signal,
    });
  };

  const manualFolders = folders?.filter((f) => f.type !== "smart") || [];

  return (
    <Layout>
      <div className="flex flex-col gap-6 pb-24">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate("/equipment")}
            data-testid="btn-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold">Add Equipment</h1>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Card>
            <CardContent className="p-4 flex flex-col gap-4">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Basic Info
              </h2>

              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g. Autoclave Unit A"
                  {...register("name")}
                  data-testid="input-name"
                />
                {errors.name && (
                  <p className="text-xs text-destructive">{errors.name.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="serialNumber">Serial Number</Label>
                <Input
                  id="serialNumber"
                  placeholder="SN-12345"
                  {...register("serialNumber")}
                  data-testid="input-serial"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="model">Model</Label>
                  <Input id="model" placeholder="Model name" {...register("model")} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="manufacturer">Manufacturer</Label>
                  <Input
                    id="manufacturer"
                    placeholder="Brand"
                    {...register("manufacturer")}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex flex-col gap-4">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Organization
              </h2>

              <div className="flex flex-col gap-2">
                <Label>Folder / Category</Label>
                <Select onValueChange={(v) => setValue("folderId", v)}>
                  <SelectTrigger data-testid="select-folder">
                    <SelectValue placeholder="No folder" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No folder</SelectItem>
                    {manualFolders.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  placeholder="e.g. Surgery Room 1"
                  {...register("location")}
                  data-testid="input-location"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="purchaseDate">Purchase Date</Label>
                <Input
                  id="purchaseDate"
                  type="date"
                  {...register("purchaseDate")}
                  data-testid="input-purchase-date"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex flex-col gap-4">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Maintenance
              </h2>

              <div className="flex flex-col gap-2">
                <Label htmlFor="maintenanceIntervalDays">
                  Maintenance Interval (days)
                </Label>
                <Input
                  id="maintenanceIntervalDays"
                  type="number"
                  placeholder="e.g. 30"
                  min={1}
                  {...register("maintenanceIntervalDays")}
                  data-testid="input-maintenance-interval"
                />
                <p className="text-xs text-muted-foreground">
                  Set to auto-alert when maintenance is overdue.
                </p>
              </div>
            </CardContent>
          </Card>

          <Button
            type="submit"
            size="lg"
            disabled={createMut.isPending}
            data-testid="btn-save"
          >
            {createMut.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Equipment
          </Button>
        </form>
      </div>
    </Layout>
  );
}
