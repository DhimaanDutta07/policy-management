import { PrismaClient, Claim, ClaimStatus, ClaimMember, DocumentCategory } from "@prisma/client";

const prisma = new PrismaClient();

// Type definitions following policy service pattern
type CreateClaimInput = {
  policy_id: string;
  claimant_type: 'SELF' | 'INSURED_MEMBER';
  claim_amount?: number;
  claim_remarks?: string;
  claim_type: 'HOSPITALIZATION' | 'DAYCARE' | 'PREPOST' | 'CASHLESS' | 'HEALTH_CHECKUP' | 'OTHER';
  claim_date?: Date | string;
  is_full_claim?: boolean;
  claim_status?: 'Pending' | 'Approved' | 'Rejected' | 'Paid';
  approved_by?: string;
  approved_at?: Date | string | null;
  rejection_reason?: string;
  members?: Array<{
    insured_member_id: string;
    member_claim_amount?: number;
    member_remarks?: string;
  }>;
};

type UpdateClaimInput = Partial<CreateClaimInput> & {
  removedDocumentIds?: string[];
  members_to_delete?: string[];
};

type ProcessedClaimDocument = {
  file_name: string;
  original_name: string;
  relative_path: string;
  file_type: "PDF" | "JPG" | "PNG" | "XLSX" | "CSV" | "DOC" | "IMAGE" | "OTHER";
  category: "OTHER";
  uploaded_by?: string;
};

// Helper to map MIME type to FileType enum (same as policy service)
function mapMimeTypeToFileType(mimeType: string): "PDF" | "JPG" | "PNG" | "XLSX" | "CSV" | "DOC" | "IMAGE" | "OTHER" {
  switch (mimeType) {
    case "application/pdf":
      return "PDF";
    case "image/jpeg":
    case "image/jpg":
      return "JPG";
    case "image/png":
      return "PNG";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "XLSX";
    case "text/csv":
      return "CSV";
    case "application/msword":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "DOC";
    case "image/gif":
    case "image/bmp":
    case "image/webp":
      return "IMAGE";
    default:
      return "OTHER";
  }
}

// Helper function to process uploaded files (following policy service pattern)
function processClaimDocuments(
  files: { [key: string]: Express.Multer.File[] } | undefined,
  folderName: string,
  uploadedBy?: string
): ProcessedClaimDocument[] {
  const claimDocs: ProcessedClaimDocument[] = [];

  if (!files) {
    console.log("📄 [ClaimFileProcessing] No files provided");
    return claimDocs;
  }

  console.log("📄 [ClaimFileProcessing] Processing files with keys:", Object.keys(files));

  // Process claim documents
  if (files.claimDocs && Array.isArray(files.claimDocs)) {
    console.log("📄 [ClaimFileProcessing] Processing claimDocs:", files.claimDocs.length);
    files.claimDocs.forEach((file, index) => {
      console.log(`📄 [ClaimFileProcessing] Claim doc ${index}:`, file.fieldname, file.originalname);
      const relativePath = `/api/uploads/policy-documents/${folderName}/${file.filename}`;
      console.log(`📄 [ClaimFileProcessing] Generated relative_path: ${relativePath}`);
      claimDocs.push({
        file_name: file.filename,
        original_name: file.originalname,
        relative_path: relativePath,
        file_type: mapMimeTypeToFileType(file.mimetype),
        category: 'OTHER',
        uploaded_by: uploadedBy,
      });
    });
  }

  // Process documents with generic field name
  if (files.documents && Array.isArray(files.documents)) {
    console.log("📄 [ClaimFileProcessing] Processing documents:", files.documents.length);
    files.documents.forEach((file, index) => {
      console.log(`📄 [ClaimFileProcessing] Document ${index}:`, file.fieldname, file.originalname);
      const relativePath = `/api/uploads/policy-documents/${folderName}/${file.filename}`;
      console.log(`📄 [ClaimFileProcessing] Generated relative_path: ${relativePath}`);
      claimDocs.push({
        file_name: file.filename,
        original_name: file.originalname,
        relative_path: relativePath,
        file_type: mapMimeTypeToFileType(file.mimetype),
        category: 'OTHER',
        uploaded_by: uploadedBy,
      });
    });
  }

  console.log("📄 [ClaimFileProcessing] Final processed documents:", {
    claimDocs: claimDocs.length
  });

  return claimDocs;
}

export class ClaimService {
  async createClaim(data: CreateClaimInput, files?: { [key: string]: Express.Multer.File[] }, userId?: string): Promise<any> {
    const { members, ...claimData } = data;
    
    console.log('🚀 Starting robust claim creation...');

    // Debug incoming data
    console.log("🧾 [ClaimService] Claim Input:", JSON.stringify({
      policy_id: claimData.policy_id,
      claimant_type: claimData.claimant_type,
      claim_amount: claimData.claim_amount,
      members_count: members?.length || 0
    }, null, 2));
    
    console.log("📄 [ClaimService] Files Received:", files ? Object.keys(files) : 'No files');

    return await prisma.$transaction(async (tx) => {
      // Get policy information first for file organization
      const policy = await tx.policy.findUnique({
        where: { id: claimData.policy_id },
        include: {
          proposer: {
            select: { full_name: true }
          },
          company: {
            select: { name: true }
          }
        }
      });
      
      if (!policy) {
        throw new Error('Policy not found');
      }

      console.log("📋 [ClaimService] Policy found:", {
        policyNumber: policy.policy_number,
        customerName: policy.customer_name,
        proposerName: policy.proposer?.full_name,
        companyName: policy.company?.name
      });

      // Prepare folder structure for file uploads (same as policy service)
      const policyNumber = policy.policy_number || 'unknown-policy';
      const customerName = (policy.customer_name || 'unknown-customer').replace(/[^a-zA-Z0-9\-]/g, '-');
      const companyName = (policy.company?.name || 'unknown-company').replace(/[^a-zA-Z0-9\-]/g, '-');
      const folderName = `${policyNumber}-${customerName}-${companyName}`;

      console.log(`📁 [ClaimService] Using policy folder: ${folderName}`);

      // Process uploaded files
      const processedDocs = processClaimDocuments(files, folderName, userId);
      
      console.log("📄 [ClaimService] Processed Documents:", {
        claimDocs: processedDocs.length
      });

      // Create the main claim
      const claim = await tx.claim.create({
        data: {
          ...claimData,
          created_by: userId,
          // Handle approval fields
          claim_status: claimData.claim_status || 'Pending',
          approved_by: claimData.approved_by || undefined,
          approved_at: (claimData.claim_status === 'Approved' || claimData.claim_status === 'Rejected') 
            ? claimData.approved_at || new Date() 
            : undefined,
          rejection_reason: claimData.rejection_reason || undefined,
        },
        include: {
          claim_members: {
            include: {
              insured_member: true,
            },
          },
          documents: true,
        },
      });

      console.log("✅ [ClaimService] Claim created:", {
        claimId: claim.id,
        policyId: claim.policy_id
      });
      
      // Create claim members
      if (members && members.length > 0) {
        await tx.claimMember.createMany({
          data: members.map((member: any) => ({
            claim_id: claim.id,
            insured_member_id: member.insured_member_id,
            member_claim_amount: member.member_claim_amount,
            member_remarks: member.member_remarks,
          })),
        });
        console.log("✅ [ClaimService] Claim members created:", members.length);
      }
      
      // Link documents to claim
      if (processedDocs.length > 0) {
        console.log("📄 [ClaimService] Linking documents to claim:", processedDocs.length);
        await tx.uploadedDocument.createMany({
          data: processedDocs.map(doc => ({
            ...doc,
            file_type: doc.file_type as any,
            claim_id: claim.id,
          })),
        });
        console.log("✅ [ClaimService] Documents linked successfully");
      }
      
      // Return the claim with fresh data including members and documents
      const result = await tx.claim.findUnique({
        where: { id: claim.id },
        include: {
          claim_members: {
            include: {
              insured_member: true,
            },
          },
          documents: true,
          policy: {
            select: {
              policy_number: true,
              customer_name: true,
              company: {
                select: { name: true }
              }
            }
          }
        },
      });

      console.log("✅ [ClaimService] Final claim result:", {
        claimId: result?.id,
        policyId: result?.policy_id,
        memberCount: result?.claim_members?.length || 0,
        documentCount: result?.documents?.length || 0
      });

      return result;
    });
  }
  
  async getClaimsByPolicy(policyId: string): Promise<any[]> {
    return await prisma.claim.findMany({
      where: { 
        policy_id: policyId,
        is_deleted: false 
      },
      include: {
        claim_members: {
          include: {
            insured_member: true,
          },
        },
        documents: true,
        policy: {
          select: {
            policy_number: true,
            customer_name: true,
          }
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }
  
  async getClaimById(id: string): Promise<any> {
    return await prisma.claim.findUnique({
      where: { id, is_deleted: false },
      include: {
        claim_members: {
          include: {
            insured_member: true,
          },
        },
        documents: true,
        policy: {
          select: {
            policy_number: true,
            customer_name: true,
            company: {
              select: { name: true }
            }
          }
        },
      },
    });
  }
  
  async updateClaimStatus(id: string, status: ClaimStatus, userId?: string, rejectionReason?: string): Promise<Claim> {
    return await prisma.claim.update({
      where: { id },
      data: {
        claim_status: status,
        approved_by: status === 'Approved' || status === 'Rejected' ? userId : undefined,
        approved_at: status === 'Approved' || status === 'Rejected' ? new Date() : undefined,
        rejection_reason: rejectionReason,
      },
      include: {
        claim_members: {
          include: {
            insured_member: true,
          },
        },
        documents: true,
      },
    });
  }

  async updateClaim(id: string, data: UpdateClaimInput, files?: { [key: string]: Express.Multer.File[] }, userId?: string): Promise<any> {
    const { members, members_to_delete, removedDocumentIds, ...claimData } = data;
    
    console.log('🔄 Starting robust claim update...');

    // Debug incoming data
    console.log("🧾 [ClaimService] Update Claim Input:", JSON.stringify({
      claimId: id,
      policy_id: claimData.policy_id,
      claimant_type: claimData.claimant_type,
      claim_amount: claimData.claim_amount,
      members_count: members?.length || 0,
      removedDocumentIds: removedDocumentIds?.length || 0,
      members_to_delete: members_to_delete?.length || 0
    }, null, 2));
    
    console.log("📄 [ClaimService] Update Files Received:", files ? Object.keys(files) : 'No files');

    return await prisma.$transaction(async (tx) => {
      // Get existing claim to validate structure
      const existingClaim = await tx.claim.findUnique({
        where: { id },
        include: {
          claim_members: {
            include: {
              insured_member: true,
            },
          },
          documents: true,
          policy: {
            include: {
              proposer: {
                select: { full_name: true }
              },
              company: {
                select: { name: true }
              }
            }
          }
        }
      });
      
      if (!existingClaim) {
        throw new Error('Claim not found');
      }

      console.log("📋 [ClaimService] Existing Claim Structure:", {
        claimId: existingClaim.id,
        policyId: existingClaim.policy_id,
        memberCount: existingClaim.claim_members?.length || 0,
        documentCount: existingClaim.documents?.length || 0
      });

      // Get policy information for file organization
      const policy = existingClaim.policy;
      
      // Prepare folder structure for file uploads (same as policy service)
      const policyNumber = policy.policy_number || 'unknown-policy';
      const customerName = (policy.customer_name || 'unknown-customer').replace(/[^a-zA-Z0-9\-]/g, '-');
      const companyName = (policy.company?.name || 'unknown-company').replace(/[^a-zA-Z0-9\-]/g, '-');
      const folderName = `${policyNumber}-${customerName}-${companyName}`;

      console.log(`📁 [ClaimService] Using policy folder: ${folderName}`);

      // Process uploaded files
      const processedDocs = processClaimDocuments(files, folderName, userId);
      
      console.log("📄 [ClaimService] Processed Update Documents:", {
        claimDocs: processedDocs.length
      });

      // Delete removed documents if any
      if (removedDocumentIds && removedDocumentIds.length > 0) {
        console.log("🗑️ [ClaimService] Deleting Documents:", removedDocumentIds);
        await tx.uploadedDocument.deleteMany({
          where: {
            id: { in: removedDocumentIds },
            claim_id: id
          }
        });
      }
      
      // Delete removed members if any
      if (members_to_delete && members_to_delete.length > 0) {
        console.log("🗑️ [ClaimService] Deleting Members:", members_to_delete);
        await tx.claimMember.deleteMany({
          where: {
            id: { in: members_to_delete },
            claim_id: id
          }
        });
      }
      
      // Update the main claim
      const claim = await tx.claim.update({
        where: { id },
        data: {
          ...claimData,
          // Handle approval fields
          claim_status: claimData.claim_status || undefined,
          approved_by: claimData.approved_by || undefined,
          approved_at: (claimData.claim_status === 'Approved' || claimData.claim_status === 'Rejected') 
            ? claimData.approved_at || new Date() 
            : undefined,
          rejection_reason: claimData.rejection_reason || undefined,
        },
        include: {
          claim_members: {
            include: {
              insured_member: true,
            },
          },
          documents: true,
        },
      });

      console.log("✅ [ClaimService] Core claim updated:", {
        claimId: claim.id,
        policyId: claim.policy_id
      });
      
      // Delete existing claim members and recreate them if new members provided
      if (members !== undefined) {
        await tx.claimMember.deleteMany({
          where: { claim_id: id }
        });
        
        // Create new claim members
        if (members && members.length > 0) {
          await tx.claimMember.createMany({
            data: members.map((member: any) => ({
              claim_id: claim.id,
              insured_member_id: member.insured_member_id,
              member_claim_amount: member.member_claim_amount,
              member_remarks: member.member_remarks,
            })),
          });
          console.log("✅ [ClaimService] Claim members updated:", members.length);
        }
      }
      
      // Link new documents to claim
      if (processedDocs.length > 0) {
        console.log("📄 [ClaimService] Linking new documents to claim:", processedDocs.length);
        await tx.uploadedDocument.createMany({
          data: processedDocs.map(doc => ({
            ...doc,
            file_type: doc.file_type as any,
            claim_id: claim.id,
          })),
        });
        console.log("✅ [ClaimService] New documents linked successfully");
      }
      
      // Return the claim with fresh data including members and documents
      const result = await tx.claim.findUnique({
        where: { id: claim.id },
        include: {
          claim_members: {
            include: {
              insured_member: true,
            },
          },
          documents: true,
          policy: {
            select: {
              policy_number: true,
              customer_name: true,
              company: {
                select: { name: true }
              }
            }
          }
        },
      });

      console.log("✅ [ClaimService] Final updated claim result:", {
        claimId: result?.id,
        policyId: result?.policy_id,
        memberCount: result?.claim_members?.length || 0,
        documentCount: result?.documents?.length || 0
      });
      
      return result;
    });
  }
  
  async deleteClaim(id: string): Promise<Claim> {
    return await prisma.claim.update({
      where: { id },
      data: { is_deleted: true },
    });
  }
}

export const claimService = new ClaimService(); 