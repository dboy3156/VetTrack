import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_LABELS } from "@/types";
import { formatRelativeTime } from "@/lib/utils";
import {
  PackageOpen,
  MapPin,
  LogOut,
  ChevronRight,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

export default function MyEquipmentPage() {
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useQuery({
    queryKey: ["/api/equipment/my"],
    queryFn: api.equipment.listMy,
  });

  const returnMut = useMutation({
    mutationFn: (id: string) => api.equipment.return(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast.success("Returned — equipment is now available");
    },
    onError: () => toast.error("Return failed"),
  });

  return (
    <Layout>
      <div className="flex flex-col gap-4 pb-24 animate-fade-in">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PackageOpen className="w-6 h-6 text-primary" />
            My Equipment
          </h1>
          {items && items.length > 0 && (
            <Badge variant="outline" className="text-primary border-primary">
              {items.length} checked out
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        ) : !items || items.length === 0 ? (
          <Card className="border-2 border-dashed border-teal-200">
            <CardContent className="p-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-teal-500" />
              </div>
              <h3 className="font-bold text-lg text-teal-700">Nothing checked out</h3>
              <p className="text-muted-foreground text-sm mt-1">
                Equipment you check out will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <Card key={item.id} className="border border-blue-200">
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-semibold text-sm truncate">{item.name}</p>
                        <Badge variant={item.status as any} className="text-[10px] shrink-0">
                          {STATUS_LABELS[item.status] || item.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Since {formatRelativeTime(item.checkedOutAt)}</span>
                        {(item.checkedOutLocation || item.location) && (
                          <span className="flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {item.checkedOutLocation || item.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-blue-300 text-blue-700 hover:bg-blue-50 h-8 px-3"
                        onClick={() => returnMut.mutate(item.id)}
                        disabled={returnMut.isPending}
                        data-testid={`btn-return-${item.id}`}
                      >
                        {returnMut.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <>
                            <LogOut className="w-3.5 h-3.5 mr-1" />
                            Return
                          </>
                        )}
                      </Button>
                      <Link href={`/equipment/${item.id}`}>
                        <Button variant="ghost" size="icon-sm">
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
