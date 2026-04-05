import { useCreateEquipment, getListEquipmentQueryKey, useListFolders } from "@/lib/api"
import { Layout } from "@/components/layout";
import { Link, useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Package, ArrowLeft, FolderOpen, Tag } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const VET_CATEGORIES = [
  "Surgical Instruments",
  "Diagnostic Imaging",
  "Anesthesia & Monitoring",
  "Dental",
  "Laboratory",
  "Sterilization (Autoclave)",
  "Pharmacy",
  "Emergency/ICU",
  "General",
];

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100, "Name too long"),
  serialNumber: z.string().max(100).optional().or(z.literal("")),
  model: z.string().max(100).optional().or(z.literal("")),
  manufacturer: z.string().max(100).optional().or(z.literal("")),
  purchaseDate: z.string().optional().or(z.literal("")),
  location: z.string().max(200).optional().or(z.literal("")),
  category: z.string().max(100).optional().or(z.literal("")),
  folderId: z.string().nullable(),
});

type FormValues = z.infer<typeof schema>;

export default function NewEquipment() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createEquipment = useCreateEquipment();
  const { data: folders } = useListFolders();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      serialNumber: "",
      model: "",
      manufacturer: "",
      purchaseDate: "",
      location: "",
      category: "",
      folderId: null,
    },
  });

  const onSubmit = (data: FormValues) => {
    createEquipment.mutate(
      {
        data: {
          name: data.name,
          folderId: data.folderId,
          serialNumber: data.serialNumber || null,
          model: data.model || null,
          manufacturer: data.manufacturer || null,
          purchaseDate: data.purchaseDate ? new Date(data.purchaseDate).toISOString() : null,
          location: data.location || null,
          category: data.category || null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListEquipmentQueryKey() });
          setLocation("/");
        },
      }
    );
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="pt-1">
          <Link
            href="/"
            className="inline-flex items-center text-base text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back
          </Link>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Add Equipment</h1>
          <p className="text-base text-muted-foreground mt-0.5">Register a new veterinary asset to the tracker.</p>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-sm p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">Equipment Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Mindray Ultrasound Scanner"
                        className="h-11 text-base border-border focus-visible:ring-primary"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-sm" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      Category <span className="text-muted-foreground font-normal">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <select
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value || "")}
                          className="w-full h-11 pl-9 pr-4 rounded-xl border border-border bg-card text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all appearance-none"
                        >
                          <option value="">No category</option>
                          {VET_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="serialNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold text-foreground">
                        Serial Number <span className="text-muted-foreground font-normal">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. VET-US-2024-0042"
                          className="h-11 text-base border-border focus-visible:ring-primary"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="model"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold text-foreground">
                        Model <span className="text-muted-foreground font-normal">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. DC-70 Pro"
                          className="h-11 text-base border-border focus-visible:ring-primary"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="manufacturer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold text-foreground">
                        Manufacturer <span className="text-muted-foreground font-normal">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Mindray"
                          className="h-11 text-base border-border focus-visible:ring-primary"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="purchaseDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold text-foreground">
                        Purchase Date <span className="text-muted-foreground font-normal">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          className="h-11 text-base border-border focus-visible:ring-primary"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      Location <span className="text-muted-foreground font-normal">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Surgery Suite 1, Cabinet A"
                        className="h-11 text-base border-border focus-visible:ring-primary"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="folderId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold text-foreground">
                      Department <span className="text-muted-foreground font-normal">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <select
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value || null)}
                          className="w-full h-11 pl-9 pr-4 rounded-xl border border-border bg-card text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all appearance-none"
                        >
                          <option value="">No department</option>
                          {folders?.map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={createEquipment.isPending}
              >
                {createEquipment.isPending ? "Saving..." : "Add Equipment"}
                {!createEquipment.isPending && <Package className="w-4 h-4 ml-2" />}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </Layout>
  );
}
