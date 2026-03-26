import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  Download, 
  Play, 
  Loader2,
  Sparkles,
  MessageSquare,
  Shield,
  Image as ImageIcon,
  Video,
  FileCode,
  Home
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getAgentStatus,
  getPendingAction,
  submitResponse,
  getArtifacts,
  getMediaUrl,
  type PendingAction,
  type Artifact,
} from "@/lib/agent-api";

const POLL_INTERVAL = 2000; // Poll every 2 seconds

const AgentStatus = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Query agent status
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["agent-status"],
    queryFn: getAgentStatus,
    refetchInterval: POLL_INTERVAL,
  });

  // Query pending action
  const { data: pendingAction, isLoading: actionLoading } = useQuery({
    queryKey: ["pending-action"],
    queryFn: getPendingAction,
    refetchInterval: POLL_INTERVAL,
  });

  // Query artifacts if we have a job_id
  const { data: artifacts = [] } = useQuery({
    queryKey: ["artifacts", status?.job_id],
    queryFn: () => getArtifacts(status!.job_id!),
    enabled: !!status?.job_id,
    refetchInterval: POLL_INTERVAL,
  });

  // Mutation for submitting responses
  const submitResponseMutation = useMutation({
    mutationFn: ({ actionId, response }: { actionId: string; response: string | boolean }) =>
      submitResponse(actionId, response),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-action"] });
      queryClient.invalidateQueries({ queryKey: ["agent-status"] });
      setClarificationAnswer("");
      toast.success("Response submitted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to submit response");
    },
  });

  // Auto-scroll logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [status?.logs]);

  const handleClarificationSubmit = () => {
    if (!pendingAction || !clarificationAnswer.trim()) {
      toast.error("Please provide an answer");
      return;
    }
    submitResponseMutation.mutate({
      actionId: pendingAction.id,
      response: clarificationAnswer.trim(),
    });
  };

  const handlePermissionResponse = (approved: boolean) => {
    if (!pendingAction) return;
    submitResponseMutation.mutate({
      actionId: pendingAction.id,
      response: approved,
    });
  };

  const getLogIcon = (level: string) => {
    switch (level) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case "warning":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Activity className="h-4 w-4 text-primary" />;
    }
  };

  const getStateBadgeVariant = (state: string) => {
    if (state.includes("WAITING")) return "destructive";
    if (state.includes("COMPLETE")) return "default";
    return "secondary";
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Agent Status & Logs
            </h1>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/")}
            className="flex items-center gap-2"
          >
            <Home className="h-4 w-4" />
            Home
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column: Status & Logs */}
          <div className="lg:col-span-2 space-y-6">
            {/* Current Status */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Current Status</CardTitle>
                  {statusLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
                {status && (
                  <CardDescription>
                    Job ID: {status.job_id || "No active job"}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {status ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Badge variant={getStateBadgeVariant(status.state)}>
                        {status.state}
                      </Badge>
                      {status.progress > 0 && (
                        <div className="flex-1">
                          <div className="h-2 w-full rounded-full bg-secondary">
                            <div
                              className="h-2 rounded-full bg-primary transition-all"
                              style={{ width: `${status.progress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{status.current_task}</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No active job</p>
                )}
              </CardContent>
            </Card>

            {/* Live Task Log */}
            <Card>
              <CardHeader>
                <CardTitle>Live Task Log</CardTitle>
                <CardDescription>Real-time agent activity</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2" ref={scrollRef}>
                    {status?.logs && status.logs.length > 0 ? (
                      status.logs.map((log) => (
                        <div
                          key={log.id}
                          className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
                        >
                          {getLogIcon(log.level)}
                          <div className="flex-1 space-y-1">
                            <p className="text-sm text-foreground">{log.message}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No logs yet
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Completed Tasks */}
            {status?.completed_tasks && status.completed_tasks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Completed Tasks</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {status.completed_tasks.map((task, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        <span className="text-foreground">{task}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column: Interactions & Outputs */}
          <div className="space-y-6">
            {/* Interaction Zone */}
            <Card>
              <CardHeader>
                <CardTitle>Interaction Zone</CardTitle>
                <CardDescription>Respond to agent requests</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {actionLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : pendingAction ? (
                  <>
                    {pendingAction.type === "clarification" && (
                      <div className="space-y-4">
                        <div className="flex items-start gap-2">
                          <MessageSquare className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground mb-2">
                              Clarification Request
                            </p>
                            {pendingAction.question && (
                              <p className="text-sm text-muted-foreground mb-3">
                                {pendingAction.question}
                              </p>
                            )}
                            {pendingAction.questions && (
                              <ul className="space-y-2 mb-3">
                                {pendingAction.questions.map((q, idx) => (
                                  <li key={idx} className="text-sm text-muted-foreground">
                                    • {q}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                        <Textarea
                          value={clarificationAnswer}
                          onChange={(e) => setClarificationAnswer(e.target.value)}
                          placeholder="Your answer..."
                          rows={3}
                          className="w-full"
                        />
                        <Button
                          onClick={handleClarificationSubmit}
                          disabled={submitResponseMutation.isPending || !clarificationAnswer.trim()}
                          className="w-full"
                        >
                          {submitResponseMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              Submitting...
                            </>
                          ) : (
                            "Submit Answer"
                          )}
                        </Button>
                      </div>
                    )}

                    {pendingAction.type === "permission" && (
                      <div className="space-y-4">
                        <div className="flex items-start gap-2">
                          <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground mb-2">
                              Permission Request
                            </p>
                            <p className="text-sm text-muted-foreground mb-3">
                              {pendingAction.permission_type === "custom_node"
                                ? "Install custom nodes:"
                                : "Download models:"}
                            </p>
                            {pendingAction.items && (
                              <ul className="space-y-2 mb-3">
                                {pendingAction.items.map((item, idx) => (
                                  <li
                                    key={idx}
                                    className="text-sm text-muted-foreground bg-secondary p-2 rounded"
                                  >
                                    <div className="font-medium">{item.name}</div>
                                    <div className="text-xs">{item.source}</div>
                                    {item.size && (
                                      <div className="text-xs text-muted-foreground">
                                        Size: {item.size}
                                      </div>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handlePermissionResponse(true)}
                            disabled={submitResponseMutation.isPending}
                            className="flex-1"
                          >
                            Approve
                          </Button>
                          <Button
                            onClick={() => handlePermissionResponse(false)}
                            disabled={submitResponseMutation.isPending}
                            variant="outline"
                            className="flex-1"
                          >
                            Deny
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No pending actions
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Output Gallery */}
            <Card>
              <CardHeader>
                <CardTitle>Output Gallery</CardTitle>
                <CardDescription>Generated artifacts</CardDescription>
              </CardHeader>
              <CardContent>
                {artifacts.length > 0 ? (
                  <div className="grid gap-4">
                    {artifacts.map((artifact) => (
                      <div
                        key={artifact.id}
                        className="rounded-lg border border-border bg-card p-4 space-y-3"
                      >
                        <div className="flex items-center gap-2">
                          {artifact.type === "image" && <ImageIcon className="h-4 w-4 text-primary" />}
                          {artifact.type === "video" && <Video className="h-4 w-4 text-primary" />}
                          {artifact.type === "workflow" && <FileCode className="h-4 w-4 text-primary" />}
                          <span className="text-sm font-medium text-foreground">
                            {artifact.filename}
                          </span>
                          {artifact.iteration !== undefined && (
                            <Badge variant="secondary" className="ml-auto">
                              Iteration {artifact.iteration}
                            </Badge>
                          )}
                        </div>

                        {artifact.type === "image" && (
                          <img
                            src={getMediaUrl(artifact.filename)}
                            alt={artifact.filename}
                            className="w-full rounded-lg border border-border"
                          />
                        )}

                        {artifact.type === "video" && (
                          <video
                            src={getMediaUrl(artifact.filename)}
                            controls
                            className="w-full rounded-lg border border-border"
                          />
                        )}

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => {
                              const link = document.createElement("a");
                              link.href = getMediaUrl(artifact.filename);
                              link.download = artifact.filename;
                              link.click();
                            }}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                          {artifact.type === "video" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const video = document.querySelector(
                                  `video[src="${getMediaUrl(artifact.filename)}"]`
                                ) as HTMLVideoElement;
                                video?.play();
                              }}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {new Date(artifact.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No artifacts yet
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AgentStatus;
