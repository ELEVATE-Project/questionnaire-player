import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Renderer2,
  SimpleChanges,
  TemplateRef,
  ViewChild,
  booleanAttribute,
} from '@angular/core';
import {
  ApiConfiguration,
  Evidence,
  Question,
  Section,
} from '../../interfaces/questionnaire.type';
import { FormBuilder, FormGroup } from '@angular/forms';
import { QuestionnaireService } from '../../services/questionnaire.service';
import { MatDialog } from '@angular/material/dialog';
import { ApiService } from '../../services/api.service';
import { catchError } from 'rxjs/operators';
import * as urlConfig from '../../constants/url-config.json';
import { ToastService } from '../../services/toast.service';
import { ThemePalette } from '@angular/material/core';
import { ProgressSpinnerMode } from '@angular/material/progress-spinner';
import { firstValueFrom, Observable, Subscribable, Subscription } from 'rxjs';
import { AlertComponent } from '../alert/alert.component';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { SharedService } from '../../services/shared.service';
import { QueryParamsService } from '../../services/queryParams.service';
import { DbService } from '../../services/db/db.service';
import { AttachmentService } from '../../services/attachment/attachment.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'lib-main-wrapper',
  templateUrl: './main-wrapper.component.html',
  styleUrls: ['./main-wrapper.component.scss'],
})
export class MainWrapperComponent implements OnInit, OnChanges, OnDestroy {
  questions: Array<Question>;
  @Input({ transform: booleanAttribute }) angular = false;
  evidence: Evidence;
  sections: Section[];
  questionnaireForm: FormGroup;
  @Input() apiConfig: ApiConfiguration;
  @Input() apiconfig: any;
  @ViewChild('questionMapModal') public questionMapModal: TemplateRef<any>;
  @ViewChild('sectionTabs') public sectionTabs: any;
  questionMap = {};
  pageMsg = new Map();
  incompleteFields: Array<{sectionName: string, sectionIndex: number, questions: Array<{_id: string, question: string, questionNumber: string, pageIndex: number, sectionIndex: number}>}> = [];
  endDate: Date;
  sectionName: string;
  listing = false;
  assessment: any;
  loaded = false;
  color: ThemePalette = 'primary';
  mode: ProgressSpinnerMode = 'indeterminate';
  strokeWidth = 4;
  dialogRef: any;
  isExpired: boolean;
  @Input() saveQuestioner: boolean = false;
  subscription: Subscription;
  isOnline: boolean = true;
  stateData: any;
  submissionId: any;
  evidenceCode: any;
  solutionType: any;
  uploading: boolean = false;
  totalFileToUpload: any = 0;
  currentFileUploaded = 0;
  sectionIndex: any = 0;
  completedPages: number = 0;
  totalPages: number = 0;
  pageProgressValue: number = 0;
  questionNotStarted: boolean | null = null;
  initialized = false;
  isDateAutoSave:boolean = false;
  private _formValueChangesSub: Subscription | null = null;
  

  constructor(
    public fb: FormBuilder,
    private dialog: MatDialog,
    public questionnaireService: QuestionnaireService,
    public apiService: ApiService,
    public toaster: ToastService,
    public location: Location,
    private renderer: Renderer2,
    private el: ElementRef,
    public router: Router,
    private sharedService: SharedService,
    private queryParamsService: QueryParamsService,
    private db: DbService,
    private attachmentService: AttachmentService,
    private http: HttpClient,

  ) { }

  checkFormValidity() {
    this.sendMessage({
      type: 'formDirty',
      isDirty: this.questionnaireForm.dirty
    }, '*');
  }

  sendMessage(message: any, target?: string) {
    // Dispatch custom event for web component listeners
    const customEvent = new CustomEvent('postMessage', {
      detail: message,
      bubbles: true,
      cancelable: true
    });
    this.el.nativeElement.dispatchEvent(customEvent);
    
    // Keep window.postMessage for backward compatibility
    window.postMessage(message, target || '*');
  }

  async ngOnChanges(changes: SimpleChanges) {
    let initialResponse:any; 

    if (
      this.angular &&
      changes['apiConfig'] &&
      changes['apiConfig'].previousValue == undefined &&
      changes['apiConfig'].currentValue
    ) {
      this.setApiService();
      let isDataInlocalSotrage = await this.checkAndMapIndexDbDataToVariables();
      if(this.apiConfig.mockData) {
        this.setValue(this.apiConfig.mockData)
      } else if (!isDataInlocalSotrage) {
        this.setApiService();
        initialResponse = this.apiService.stateData ? await this.getQuestions(this.apiService.stateData) : await this.fetchDetails();
      }

      setTimeout(async () => {
        if (Array.isArray(this.sections) && this.sections.length > 0) {
          await this.setSection(this.sectionIndex);
        } else {
          console.warn('Skipping setSection; sections not ready yet (ngOnInit/ngOnChanges).');
        }
      }, 1000);
  
    }

    if (changes['saveQuestioner']) {
      if (this.saveQuestioner == true) {
        this.submission('draft');
      }
    }
  }

  async ngOnInit() {
    this.loadInitialData();
    this.toaster.clearToaster();

    let isDataInlocalSotrage = await this.checkAndMapIndexDbDataToVariables();
    if (typeof this.apiConfig === 'string' || typeof this.apiconfig === 'string') {
      try {
        let data = this.apiConfig || this.apiconfig || '{}';
        this.apiConfig = JSON.parse(data);
        if(this.apiConfig.mockData) {
          this.setValue(this.apiConfig.mockData)
        } else if (!isDataInlocalSotrage) {
          this.setApiService();
          this.apiService.stateData ? this.getQuestions(this.apiService.stateData) : this.fetchDetails();
        }
      } catch (error) {
        throw new Error('Invalid Assessment Structure', error);
      }
    }

    setTimeout(async () => {
      if (Array.isArray(this.sections) && this.sections.length > 0) {
        await this.setSection(this.sectionIndex);
      } else {
        console.warn('Skipping setSection; sections not ready yet (ngOnInit/ngOnChanges).');
      }
    }, 1000);


    this.questionnaireForm = this.fb.group({});

    // Initial subscription for form validity check only
    // Progress calculation will be handled in setSection subscription via updateDataInIndexDb
    this.questionnaireForm.valueChanges
    .pipe(
      debounceTime(300),
      distinctUntilChanged()
    )
    .subscribe((data: any) => {
      this.checkFormValidity();
    })
    this.attachmentService.trigger$.subscribe(() => {
      // Calculate progress before updating IndexDB using unified method
      this.calculateInitialProgress();

      const evidenceData = this.questionnaireService.getEvidenceData(
        this.evidence,
        this.questionnaireForm.value
      );

      // evidenceData['status'] = 'draft';
      const submissionData = {
        status: evidenceData['isSubmitted'] ? "submit" : "draft",
        ...evidenceData,
      };

      this.updateDataInIndexDb(submissionData);
    });

  }

  
  async getQueryParms() {
    this.queryParamsService.parseQueryParams();
    this.submissionId = this.queryParamsService?.submissionId || this.submissionId || "";
    this.evidenceCode = this.queryParamsService?.evidenceCode || this.evidenceCode;
    
    // Preserve current sectionIndex - only set from query params if explicitly provided and not already set
    // This prevents resetting sectionIndex to 0 when getQueryParms is called during form updates
    if (this.queryParamsService?.sectionIndex !== undefined && this.queryParamsService?.sectionIndex !== null) {
      // Only update if sectionIndex hasn't been set yet (initial load) or if query param explicitly provides a value
      if (this.sectionIndex === 0 && this.queryParamsService.sectionIndex !== 0) {
        this.sectionIndex = this.queryParamsService.sectionIndex;
      }
    }
    // Don't reset to 0 if sectionIndex is already set - preserve user's current tab selection

    // if (!submissionId || !evidenceCode) {
    //   return null;
    // }

    return {
      indexDbKey: `${this.submissionId}`,
      evidenceCode: `${this.evidenceCode}`
    };
  }

  async setDataInIndexDb(submissionId: any) {
    const queryParamsData = await this.getQueryParms();
    const indexDbKey = queryParamsData?.indexDbKey;

    const data = {
      key: submissionId ? submissionId : indexDbKey,
      data: this.assessment
    }
    try {
      await this.db.addData(data);
    } catch (error) {
      console.error("Failed to store data in IndexedDB", error);
    }
  }

  getProgressStatus(submission: any): number {
    if (!submission || !submission.answers) return 0;
  
    const answersObj = submission.answers;
  
    let totalQuestions = 0;
    let answeredCount = 0;
  
    for (const qid of Object.keys(answersObj)) {
      const answer = answersObj[qid];
      const value = answer.value;
      const responseType = answer.responseType;
  
      const visibleIf = answer.visibleIf;
      if (Array.isArray(visibleIf) && visibleIf.length > 0) {
        let isVisible = false;
  
        for (const condition of visibleIf) {
          const targetQid = condition._id;
          const targetValue = condition.value?.[0];
          const operator = condition.operator;
          const targetAnswer = answersObj[targetQid];
  
          if (!targetAnswer || targetAnswer.value === undefined || targetAnswer.value === null) {
            isVisible = false;
            break;
          }
  
          const actualValue = targetAnswer.value;
          if (operator === '===' && actualValue === targetValue) {
            isVisible = true;
          }
        }
  
        if (!isVisible) continue;
      }
  
      totalQuestions++;
      let isAnswered = false;
      if (Array.isArray(value)) {
        isAnswered = value.some((v: any) => v && v.toString().trim() !== '');
      } else if (value !== undefined && value !== null) {
        const strVal = value.toString().trim();
        if (responseType === 'slider') {
          isAnswered = strVal !== '' && strVal !== '0' && strVal !== '1'; // ignore default 1
        } else {
          isAnswered = strVal !== '';
        }
      }
  
      if (isAnswered) answeredCount++;
    }
  
    if (totalQuestions === 0) return 0;
  
    return Math.round((answeredCount / totalQuestions) * 100);
  }
  
  async updateDataInIndexDb(updatedAnswers) {
    // Preserve current sectionIndex before calling getQueryParms
    const currentSectionIndex = this.sectionIndex;
    
    const queryParamsData = await this.getQueryParms();
    const indexDbKey = queryParamsData?.indexDbKey;
    const evidenceCode = queryParamsData?.evidenceCode;
    
    // Restore sectionIndex if it was changed by getQueryParms
    if (this.sectionIndex !== currentSectionIndex) {
      this.sectionIndex = currentSectionIndex;
      // Also sync with sectionTabs component
      if (this.sectionTabs) {
        this.sectionTabs.sectionIndex = currentSectionIndex;
      }
    }
    
    if (!indexDbKey || indexDbKey === 'undefined') {
      return false;
    }

    const assessmentClone = JSON.parse(JSON.stringify(this.assessment));
    const submissions = assessmentClone.assessment.submissions;
    const evidences = assessmentClone.assessment.evidences;
    const evidenceIndex = +this.apiConfig.index;


    if (!submissions[evidenceCode]) {
      submissions[evidenceCode] = {
        externalId: evidenceCode,
        answers: {},
        startTime: Date.now(),
        endTime: this.endDate,
        gpsLocation: null,
        submittedBy: '',
        submittedByName: '',
        submissionDate: new Date().toISOString(),
        isValid: true,
        status: 'draft',
        progressStatus: this.questionNotStarted ? 'notStarted' : 'inProgress',
        pageProgressValue: this.pageProgressValue,
        completePercentage: 0
      };
    }

    submissions[evidenceCode].answers = { ...updatedAnswers?.answers };
    submissions[evidenceCode].status = evidences[evidenceIndex]?.isSubmitted 
      ? 'save'
      : updatedAnswers?.status === 'draft'
        ? 'draft'
        : 'submit';


    const progress = this.getProgressStatus(submissions[evidenceCode]);
    let progressStatus = 'notStarted';
    if (progress === 100) progressStatus = 'completed';
    else if (progress > 0) progressStatus = 'inProgress';
    else if (!this.questionNotStarted) progressStatus = 'inProgress';

    // Progress values are current from form valueChanges; no recalculation here.

    if (evidences && evidences[evidenceIndex]) {
      evidences[evidenceIndex].completePercentage = progress;
      evidences[evidenceIndex].progressStatus = progressStatus;
      evidences[evidenceIndex].pageProgressValue = this.pageProgressValue;
      evidences[evidenceIndex].completedPages = this.completedPages;
      evidences[evidenceIndex].totalPages = this.totalPages;
      evidences[evidenceIndex].isSubmitted = ['save', 'submit'].includes(submissions[evidenceCode].status);
    }

    const data = {
      key: indexDbKey,
      data: assessmentClone
    };

    try {
      await this.db.updateData(data);
      this.assessment = assessmentClone;

      return true;
    } catch (error) {
      console.error("❌ Failed to store data in IndexedDB", error);
      return false;
    }
  }

  async deleteFromIndexDb() {
    const queryParamsData = await this.getQueryParms();
    const indexDbKey = queryParamsData?.indexDbKey;
    this.db.deleteData(indexDbKey);
  }

  async checkAndMapIndexDbDataToVariables() {
    const queryParamsData = await this.getQueryParms();

    const indexDbKey = queryParamsData?.indexDbKey;
    let indexdbData = await this.db.getData(indexDbKey);
    let currentObservation = indexdbData?.data;

    if (this.solutionType === "survey") {
      const submissions = currentObservation?.assessment?.submissions;
      if (submissions && typeof submissions === 'object') {
        this.evidenceCode = Object.keys(submissions)[0];
      }
    }
    if (currentObservation) {
      this.assessment = this.questionnaireService.mapSubmissionToAssessment(
        currentObservation
      );
      this.evidence = this.solutionType == 'observation' ? currentObservation?.assessment?.evidences[+[this.apiConfig.index]] : currentObservation?.assessment?.evidences[0];
      this.evidenceCode=this.evidence.code;
      this.pageProgressValue = this.evidence?.pageProgressValue || 0;
      this.completedPages = this.evidence?.completedPages || 0;
      this.totalPages = this.evidence?.totalPages || 0;
      
      this.evidence.startTime = Date.now();
      this.endDate = new Date(
        new Date(currentObservation?.assessment?.endDate).getTime() +
        new Date(currentObservation?.assessment?.endDate).getTimezoneOffset() *
        60000
      );
      this.isExpired = currentObservation?.assessment?.status == 'expired' || false;
      this.sections = this.evidence?.sections;

      this.setSection(this.sectionIndex);

      this.questionnaireForm = this.fb.group({});

      this.questionnaireForm.valueChanges.subscribe((data: any) => {
        this.checkFormValidity();
      })
      
      // Calculate initial progress after form controls are initialized in one line.
      setTimeout(() => {
        this.calculateInitialProgress();
      }, 500);
      
      // Apply default values after page loads, then set loaded = true
      await this.applyDefaultValuesAfterLoad();
    }
    return currentObservation ? true : false;
  }

  setApiService() {
    this.apiService.baseUrl = this.apiConfig.baseURL;
    this.apiService.token = this.apiConfig.userAuthToken;
    this.apiService.solutionType = this.apiConfig.solutionType || 'observation';
    this.apiService.observationId = this.apiConfig.observationId;
    this.apiService.entityId = this.apiConfig.entityId;
    this.apiService.submissionNumber = this.apiConfig.submissionNumber;
    this.apiService.evidenceCode = this.apiConfig.evidenceCode;
    this.apiService.index = this.apiConfig.index;

    this.apiService.profileData = this.apiConfig.profileData;
    this.apiService.stateData = this.apiConfig.stateData;

    this.stateData = this.apiConfig.stateData;
    this.solutionType = this.apiConfig.solutionType || 'observation';
    this.getQueryParms();

  }

  async fetchDetails() {
    const path = this.solutionType == 'observation' ? this.apiConfig.observationId + `?entityId=${this.apiConfig.entityId}&submissionNumber=${this.apiConfig.submissionNumber}&evidenceCode=${this.apiConfig.evidenceCode}` : this.apiConfig.solutionId


    this.subscription = this.apiService.post(`${urlConfig[this.solutionType].details}` + path, this.apiConfig.profileData)
      .pipe(
        catchError((err) => {
          throw new Error('Could not fetch the details');
        })
      )
      .subscribe(async (res: any) => {
        if (!res.result) {
          this.surveyExpired(res)
          return;
        }


        if (res.result) {
          this.setValue(res.result);
        } else {
          this.toaster.showToast('Something went wrong, Please try again later', 'danger', 5000)
        }

      });
  }

  async setValue(data: any) {
    this.assessment = this.questionnaireService.mapSubmissionToAssessment(data);
    this.submissionId = this.assessment.assessment.submissionId;
    this.evidenceCode = this.assessment.assessment.evidences[0].code;
    let isDataInlocalSotrage = await this.checkAndMapIndexDbDataToVariables();
    this.enableDisableStartBtn(this.assessment.assessment.evidences[0]);
    if (!isDataInlocalSotrage) {
      this.setDataInIndexDb(this.submissionId);
      this.evidence = this.solutionType == 'observation' ? this.assessment?.assessment?.evidences[+[this.apiConfig.index]] : this.assessment?.assessment?.evidences[0];
      this.evidence.startTime = Date.now();
      this.endDate = new Date(
        new Date(this.assessment?.assessment?.endDate).getTime() +
        new Date(this.assessment?.assessment?.endDate).getTimezoneOffset() *
        60000
      );
      this.isExpired = this.assessment?.assessment?.status == 'expired';
      this.sections = this.evidence?.sections;
      
      // Apply default values after page loads, then set loaded = true
      await this.applyDefaultValuesAfterLoad();
    } else {
      // Apply default values after page loads, then set loaded = true
      await this.applyDefaultValuesAfterLoad();
    }
  }

  /**
   * Apply default values to assessment.submissions after page loads
   */
  async applyDefaultValuesAfterLoad() {
    // Wait for everything to be ready
    if (!this.assessment || !this.evidence || !this.evidenceCode || !this.sections) {
      setTimeout(() => this.applyDefaultValuesAfterLoad(), 500);
      return;
    }

    // Check if defaultValues exist
    if (this.apiConfig?.defaultValues) {
      // Ensure submissions object exists
      if (!this.assessment.assessment.submissions) {
        this.assessment.assessment.submissions = {};
      }
      
      // Ensure submission for this evidenceCode exists
      if (!this.assessment.assessment.submissions[this.evidenceCode]) {
        this.assessment.assessment.submissions[this.evidenceCode] = {
          externalId: this.evidenceCode,
          answers: {},
          startTime: Date.now(),
          endTime: this.endDate || null,
          gpsLocation: null,
          submittedBy: '',
          submittedByName: '',
          submissionDate: new Date().toISOString(),
          isValid: true,
          status: 'draft',
          progressStatus: 'notStarted',
          pageProgressValue: 0,
          completePercentage: 0
        };
      }

      // Ensure answers object exists
      if (!this.assessment.assessment.submissions[this.evidenceCode].answers) {
        this.assessment.assessment.submissions[this.evidenceCode].answers = {};
      }

      // Apply default values to submissions AND question objects
      Object.keys(this.apiConfig.defaultValues).forEach(qId => {
        const defaultConfig = this.apiConfig.defaultValues[qId];
        if (defaultConfig?.value !== undefined && defaultConfig?.value !== null) {
          const valueToSet = typeof defaultConfig.value === 'number' 
            ? String(defaultConfig.value) 
            : defaultConfig.value;
          
          // Find question to set value and get responseType
          let questionFound = null;
          let responseType = 'text';
          
          for (const section of this.sections || []) {
            for (const question of section.questions || []) {
              if (question._id === qId) {
                questionFound = question;
                responseType = question.responseType;
                // Set value on question object so it appears in form
                question.value = valueToSet;
                question.readonly = defaultConfig.readonly === true;
                break;
              }
              // Check pageQuestions
              if (question.pageQuestions) {
                for (const pq of question.pageQuestions) {
                  if (pq._id === qId) {
                    questionFound = pq;
                    responseType = pq.responseType;
                    // Set value on pageQuestion object
                    pq.value = valueToSet;
                    pq.readonly = defaultConfig.readonly === true;
                    break;
                  }
                }
              }
            }
          }
          
          // Only set in submissions if answer doesn't already exist
          if (!this.assessment.assessment.submissions[this.evidenceCode].answers[qId]) {
            this.assessment.assessment.submissions[this.evidenceCode].answers[qId] = {
              value: valueToSet,
              remarks: '',
              fileName: [],
              endTime: Date.now(),
              responseType: responseType
            };
          }
          
          // Update form control if it exists
          if (this.questionnaireForm && this.questionnaireForm.controls[qId]) {
            const control = this.questionnaireForm.controls[qId];
            control.setValue(valueToSet, { emitEvent: false });
            if (defaultConfig.readonly === true) {
              control.disable();
            }
          }
        }
      });

      // Update IndexDB with default values
      const submissionData = {
        status: 'draft',
        answers: this.assessment.assessment.submissions[this.evidenceCode].answers
      };
      await this.updateDataInIndexDb(submissionData);
      console.log('update');
    }

    // Set loaded = true after applying default values
    this.loaded = true;
  }

  getIncompleteFields() {
    this.incompleteFields = [];
    const enablePagination = this.apiConfig?.enablePagination !== false;
    
    if (!this.sections || !this.questionnaireForm) {
      return;
    }

    for (let sectionIndex = 0; sectionIndex < this.sections.length; sectionIndex++) {
      let questionIndexInSection = 0;
      const sectionIncompleteQuestions: Array<{_id: string, question: string, questionNumber: string, pageIndex: number, sectionIndex: number}> = [];

      for (let questionIndex = 0; questionIndex < this.sections[sectionIndex].questions.length; questionIndex++) {
        const question = this.sections[sectionIndex].questions[questionIndex];
        
        // Check if question is visible
        const isVisible = (Array.isArray(question.visibleIf) && question.canDisplay) || !Array.isArray(question.visibleIf);
        if (!isVisible) continue;

        if (question.responseType === 'pageQuestions') {
          for (let pqIndex = 0; pqIndex < question.pageQuestions.length; pqIndex++) {
            const pageQuestion = question.pageQuestions[pqIndex];
            const pqIsVisible = (Array.isArray(pageQuestion.visibleIf) && pageQuestion.canDisplay) || !Array.isArray(pageQuestion.visibleIf);
            if (!pqIsVisible) continue;

            const control = this.questionnaireForm.controls[pageQuestion._id];
            const validation = pageQuestion.validation;
            const isRequired = typeof validation !== 'string' && validation?.required;
            const value = control?.value;

            if (isRequired) {
              const isEmpty = Array.isArray(value) 
                ? !value.some(v => v !== '' && v != null && v !== undefined)
                : (value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === ''));

              if (isEmpty || !control?.valid) {
                sectionIncompleteQuestions.push({
                  _id: pageQuestion._id,
                  question: pageQuestion.question,
                  questionNumber: pageQuestion.questionNumber,
                  pageIndex: enablePagination ? questionIndex : questionIndexInSection,
                  sectionIndex: sectionIndex
                });
              }
            }
            questionIndexInSection++;
          }
        } else {
          const control = this.questionnaireForm.controls[question._id];
          const validation = question.validation;
          const isRequired = typeof validation !== 'string' && validation?.required;
          const value = control?.value;

          if (isRequired) {
            const isEmpty = Array.isArray(value)
              ? !value.some(v => v !== '' && v != null && v !== undefined)
              : (value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === ''));

            if (isEmpty || !control?.valid) {
              sectionIncompleteQuestions.push({
                _id: question._id,
                question: question.question,
                questionNumber: question.questionNumber,
                pageIndex: enablePagination ? questionIndex : questionIndexInSection,
                sectionIndex: sectionIndex
              });
            }
          }
          questionIndexInSection++;
        }
      }

      if (sectionIncompleteQuestions.length > 0) {
        this.incompleteFields.push({
          sectionName: this.sections[sectionIndex].name,
          sectionIndex: sectionIndex,
          questions: sectionIncompleteQuestions
        });
      }
    }
  }

  getQuestionMap() {
    // Reset questionMap and pageMsg to prevent duplicates on multiple renders
    this.questionMap = {};
    this.pageMsg.clear();
    
    // Check if pagination is enabled (default to true for backward compatibility)
    const enablePagination = this.apiConfig?.enablePagination !== false;
    
    for (
      let sectionIndex = 0;
      sectionIndex < this.sections.length;
      sectionIndex++
    ) {
      // Track question index within section for non-paginated mode
      let questionIndexInSection = 0;
      
      for (
        let questionIndex = 0;
        questionIndex < this.sections[sectionIndex].questions.length;
        questionIndex++
      ) {
        // Determine the map key based on enablePagination
        let mapKey: string;
        if (enablePagination) {
          // Paginated mode: Group by "Section - Page X"
          mapKey = `${this.sections[sectionIndex].name} - Page ${questionIndex + 1}`;
        } else {
          // Non-paginated mode: Group by section name only
          mapKey = `${this.sections[sectionIndex].name} - ${this.sections[sectionIndex].questions[questionIndex].question} ${questionIndex + 1}`;
        }
        
        // Initialize the map key if it doesn't exist
        if (!this.questionMap[mapKey]) {
          this.questionMap[mapKey] = [];
        }
        
        if (
          this.sections[sectionIndex].questions[questionIndex].responseType ==
          'pageQuestions'
        ) {
          for (
            let pqIndex = 0;
            pqIndex <
            this.sections[sectionIndex].questions[questionIndex].pageQuestions
              .length;
            pqIndex++
          ) {
            if (
              (Array.isArray(
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex].visibleIf
              ) &&
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex].canDisplay) ||
              !Array.isArray(
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex].visibleIf
              )
            ) {
              let value =
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex].value;
              if (
                !this.questionnaireForm.controls[
                  this.sections[sectionIndex].questions[questionIndex]
                    .pageQuestions[pqIndex]._id
                ]?.valid
              ) {
                value = [];
              }
              if (
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex].responseType == 'slider'
              ) {
                this.pageMsg.set(
                  mapKey,
                  'Please review your response to the slider question on this page'
                );
              }
              this.setQuestionMap(
                sectionIndex,
                enablePagination ? questionIndex : questionIndexInSection,
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex].validation,
                value,
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex]._id,
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex].questionNumber,
                mapKey
              );
              questionIndexInSection++;
            }
          }
        } else {
          if (
            (Array.isArray(
              this.sections[sectionIndex].questions[questionIndex].visibleIf
            ) &&
              this.sections[sectionIndex].questions[questionIndex]
                .canDisplay) ||
            !Array.isArray(
              this.sections[sectionIndex].questions[questionIndex].visibleIf
            )
          ) {
            let value =
              this.sections[sectionIndex].questions[questionIndex].value;
            if (
              !this.questionnaireForm.controls[
                this.sections[sectionIndex].questions[questionIndex]._id
              ]?.valid
            ) {
              value = [];
            }
            if (
              this.sections[sectionIndex].questions[questionIndex]
                .responseType == 'slider'
            ) {
              this.pageMsg.set(
                mapKey,
                'Please review your response to the slider question on this page'
              );
            }
            this.setQuestionMap(
              sectionIndex,
              enablePagination ? questionIndex : questionIndexInSection,
              this.sections[sectionIndex].questions[questionIndex].validation,
              value,
              this.sections[sectionIndex].questions[questionIndex]._id,
              this.sections[sectionIndex].questions[questionIndex]
                .questionNumber,
              mapKey
            );
            questionIndexInSection++;
          }
        }
      }
    }
    if (this.apiConfig?.showSaveDraftButton === true) {
      this.getIncompleteFields();
    }
    
    this.dialog.open(this.questionMapModal, {
      width: 'auto',
      enterAnimationDuration: 300,
      exitAnimationDuration: 150,
      disableClose: true,
      hasBackdrop: true,
    });
  }

  setQuestionMap(sectionIndex, qIndex, qValidation, qValue, questionId, qNum, mapKey?: string) {
    const validation = qValidation;
    const value = qValue;
    const question = {
      _id: questionId,
      validity:
        (value && value.length > 0) || Number.isInteger(value)
          ? '#006600'
          : typeof validation !== 'string' && validation.required
            ? '#A30000'
            : '#595959',
      sectionName: this.sections[sectionIndex].name,
      sectionIndex: sectionIndex,
      pageIndex: qIndex,
      questionNumber: qNum,
    };
    
    // Use provided mapKey or generate default based on pagination mode
    const keyToUse = mapKey || `${this.sections[sectionIndex].name} - Page ${qIndex + 1}`;
    
    if (!this.questionMap[keyToUse]) {
      this.questionMap[keyToUse] = [];
    }
    
    // Check if question already exists in the map to prevent duplicates
    const questionExists = this.questionMap[keyToUse].some(q => q._id === questionId);
    if (!questionExists) {
      this.questionMap[keyToUse].push(question);
    }
  }

  enableRelevantPage() {
    // Only hide/show sections if there's a single section (not using Material tabs)
    // Material tabs handle visibility automatically for multiple sections
    if (this.sections && this.sections.length === 1) {
      // Single section mode: ensure it's visible
      this.domQuery(this.sectionName, 'block');
    } else if (this.sections && this.sections.length > 1) {
      // Multiple sections mode: Material tabs handle visibility
      // Just ensure all sections are visible (Material tabs will show/hide as needed)
      for (let i = 0; i < this.sections.length; i++) {
        const sectionElement = document.getElementById(this.sections[i].name);
        if (sectionElement) {
          // Remove any inline display styles to let Material tabs control visibility
          sectionElement.style.display = '';
        }
      }
    }
    
    if (document.getElementById('observation-ion-toolbar')) {
      document.getElementById('observation-ion-toolbar').style.display = 'block'
    }
  }

  domQuery(elemendId: string, action: string) {
    if (document.getElementById(`${elemendId}`)) {
      document.getElementById(`${elemendId}`).style.display = action;
    }
  }

  handleSubmitClick() {
    if ((this.apiConfig?.showSaveDraftButton === true && this.pageProgressValue != 100) || (this.apiConfig?.showSaveDraftButton !== true && !this.questionnaireForm?.valid)) {
      this.getQuestionMap();
    } else {
      this.submission('submit');
    }
  }

  async submission(status) {
    this.setApiService();
    const evidenceData = this.questionnaireService.getEvidenceData(
      this.evidence,
      this.questionnaireForm.value
    );

    status == 'save' ? (evidenceData['status'] = 'draft') : null;
    const submissionData = {
      status: status,
      ...evidenceData,
    };
    await this.submitSurvey(submissionData);
  }

  async submitImageToCloud(payload: any, uploadQueue: any[]): Promise<any[]> {
    try {
      this.setApiService();
      const response: any = await firstValueFrom(
        this.apiService.post(urlConfig.presignedUrl, payload)
      );
      const submissionId = Object.keys(response.result).find(
        (key) => key !== 'cloudStorage'
      );

      const fileList = response.result[submissionId]?.files || [];
      const uploadResults: any[] = [];

      for (let file of uploadQueue) {
        const presignedUrlData = fileList.find((f: any) => f.file === file.name);

        if (!presignedUrlData) {
          console.error(`Presigned URL not found for file: ${file.name}`);
          continue;
        }

        const headers = new HttpHeaders({
          'Content-Type': 'multipart/form-data',
          'x-ms-blob-type': 'BlockBlob',
        });

        const storedFile: any = await this.db.getData(file.name);
        if (storedFile?.data) {
          const convertedFile = this.attachmentService.base64ToFile(storedFile.data);
          file.file = convertedFile;
        }


        await firstValueFrom(
          this.http.put(presignedUrlData.url, file.file, { headers })
        );

        file.isUploaded = true;
        file.url = presignedUrlData.url;
        file.previewUrl = presignedUrlData.getDownloadableUrl[0];
        file.sourcePath = presignedUrlData.payload?.sourcePath || '';
        this.currentFileUploaded++;

        uploadResults.push(file);
      }

      return uploadResults;

    } catch (err) {
      console.error('Batch upload failed', err);
      throw err;
    }
  }

  async submitSurvey(submissionData) {
    if (submissionData.status !== 'draft') {
      this.isDateAutoSave = true;
  
      if (!this.saveQuestioner) {
        const confirmationParams = {
          title: 'Confirmation',
          message: `Are you sure you want to submit the ${this?.assessment?.solution?.name}?`,
          actionBtns: true,
          cancelLabel: 'Cancel',
          acceptLabel: 'Confirm',
        };
  
        const response = await this.openAlert(confirmationParams);
        if (!response) return;
  
        this.totalFileToUpload = 0;
        this.currentFileUploaded = 0;
  
        const answers = submissionData?.answers;
        const uploadQueue: any[] = [];
  
        for (let [submissionId, answerObj] of Object.entries(answers)) {
          const files = (answerObj as any).fileName || [];
          for (let file of files) {
            if (!file?.isUploaded) {
              this.totalFileToUpload++;
              const storedFile: any = await this.db.getData(file.name);
              if (!storedFile || !storedFile.data) {
                this.toaster.showToast(`No stored data found for file: ${file.name}`, 'danger', 5000);
                continue;
              }
              file.submissionId = submissionId;
              uploadQueue.push(file);
            }
          }
        }
  
        this.uploading = true;
  
        try {
          if (uploadQueue.length > 0) {
            const payload = {
              ref: 'survey',
              request: {
                [this.submissionId]: {
                  files: uploadQueue.map(file => file.name)
                }
              }
            };
  
            const uploadedFiles = await this.submitImageToCloud(payload, uploadQueue);
  
            for (let i = 0; i < uploadQueue.length; i++) {
              const file = uploadQueue[i];
              const presignedUrlData = uploadedFiles[i];
              file.isUploaded = true;
              file.previewUrl = presignedUrlData.previewUrl;
              file.url = presignedUrlData.url;
              file.sourcePath = presignedUrlData.sourcePath;
              this.currentFileUploaded++;
            }
  
            await this.updateDataInIndexDb(submissionData);
          }
        } catch (uploadErr) {
          console.error('Batch upload failed:', uploadErr);
          this.toaster.showToast(`Failed to upload files`, 'danger', 5000);
          this.uploading = false;
          return;
        } finally {
          this.uploading = false;
        }
      }
      const filteredSubmissionData = JSON.parse(JSON.stringify(submissionData));
      if (filteredSubmissionData.answers) {
        for (let [submissionId, answerObj] of Object.entries(filteredSubmissionData.answers)) {
          const files = (answerObj as any).fileName || [];
          (answerObj as any).fileName = files.filter(f => f.isUploaded);
        }
      }

      this.apiService
        .post(
          `${urlConfig[this.solutionType].update}${this.assessment.assessment.submissionId}`,
          { evidence: filteredSubmissionData }
        )
        .pipe(
          catchError((err) => {
            const errorMsg = err?.error?.message || 'Submission failed';
            this.toaster.showToast(errorMsg, 'danger', 5000);
            throw err;
          })
        )
        .subscribe(async (res: any) => {
          if (res.status === 200 && !this.saveQuestioner) {
            await this.updateDataInIndexDb(submissionData);
  
            this.formIsNotDirty();
            const footer = this.el.nativeElement.querySelector('.footer-buttons');
            this.renderer.setStyle(footer, 'display', 'none');
            this.toaster.showToast(
              `Your ${this?.assessment?.solution?.name} has been submitted successfully.`,
              'success',
              5000
            );
            this.evidence.isSubmitted = true;
  
            setTimeout(() => {
              // this.location.back();

              this.sendMessage({
                type: 'submissionSuccess',
                data: {
                  submissionId: this.submissionId,
                  evidenceCode: this.evidenceCode
                }
              }, '*');
            }, 1000);
          } else {
            this.toaster.showToast(res?.message || 'Submission failed', 'danger', 5000);
            this.evidence.isSubmitted = false;
            await this.updateDataInIndexDb({ ...submissionData, status: 'draft' });
          }
        });
  
    } else {
      const responseFromUpdateDataFunction = await this.updateDataInIndexDb(submissionData);
      if (responseFromUpdateDataFunction && !this.saveQuestioner) {
        this.formIsNotDirty();
        if (this.questionnaireForm.dirty && !this.isDateAutoSave) {
          const message = { type: 'PROGRAMS', data: 'Your changes have been saved.' };
          this.sendMessage(message, '*');
          this.toaster.showToast(`Your changes have been saved.`, 'success', 5000);
        }
        this.isDateAutoSave = false;
      }
    }
  }
  

  async openAlert(alertDialogConfig) {
    const dialogRef = await this.dialog.open(AlertComponent, {
      data: alertDialogConfig,
      width: 'auto',
      enterAnimationDuration: 300,
      exitAnimationDuration: 150,
      disableClose: true
    });

    this.dialogRef = dialogRef

    return new Observable<boolean>((observer) => {
      dialogRef.afterClosed().subscribe((res) => {
        if (res) {
          this.dialogRef.close();
        }
        observer.next(res);
        observer.complete();
      });
    }).toPromise();
  }

  async setSection(index: any, skipEnableDisableStartBtn:any = false) {
    if (!Array.isArray(this.sections) || this.sections.length === 0) {
      console.warn('setSection called before sections are available. sectionIndex:', index, 'sections:', this.sections);
      return;
    }
    let idx = Number(index);
    if (Number.isNaN(idx) || !Number.isFinite(idx)) {
      idx = 0;
    }
    idx = Math.max(0, Math.min(idx, this.sections.length - 1));
    this.sectionIndex = idx;
    const section = this.sections[idx];
    if (!section) {
      console.warn('No section found at index', idx, 'sections length', this.sections.length);
      return;
    }
    this.sectionName = section.name;
    
    // Sync sectionTabs component's sectionIndex before calling enableRelevantPage
    if (this.sectionTabs && this.sectionTabs.sectionIndex !== idx) {
      this.sectionTabs.sectionIndex = idx;
    }
    
    this.enableRelevantPage();
    
    // Wait a bit for Material tabs to update before calling enableRelevantPage on main component
    setTimeout(() => {
      this.sectionTabs?.getCurrentMainComponent()?.enableRelevantPage();
    }, 50);
    if (this._formValueChangesSub) {
      this._formValueChangesSub.unsubscribe();
    }

    this._formValueChangesSub = this.questionnaireForm?.valueChanges
      ?.pipe(debounceTime(500), distinctUntilChanged())
      .subscribe((data: any) => {
        if (!data || !this.evidence) return;

        // Calculate progress FIRST, synchronously, using unified method
        this.calculateInitialProgress();

        const evidenceData = this.questionnaireService.getEvidenceData(this.evidence, data);
        if (!evidenceData?.answers) return;

        const submissionData = {
          status: evidenceData['isSubmitted'] ? "submit" : "draft",
          ...evidenceData,
        };
        this.updateDataInIndexDb(submissionData).then(() => {});
      });

    if(!skipEnableDisableStartBtn){
      setTimeout(() => {
        if (this.evidence) {
          this.enableDisableStartBtn(this.evidence);
        }
      }, 50);
    }
  }

  closeModal() {
    this.dialog.closeAll();
  }

  onTabChange(newIndex: number) {
    if (newIndex !== undefined && newIndex !== this.sectionIndex) {
      // Ensure all sections are visible before switching (Material tabs will handle visibility)
      if (this.sections && this.sections.length > 1) {
        for (let i = 0; i < this.sections.length; i++) {
          const sectionElement = document.getElementById(this.sections[i].name);
          if (sectionElement) {
            // Remove any inline display styles to let Material tabs control visibility
            sectionElement.style.display = '';
          }
        }
      }
      this.setSection(newIndex);
    }
  }

  getFilteredQuestion(question: any): string {
    if (!question || !question.question) {
      return '';
    }
    
    // If it's an array, filter out empty, null, and undefined values
    if (Array.isArray(question.question)) {
      return question.question
        .filter(q => q !== null && q !== undefined && q !== '')
        .join(' ');
    }
    
    // If it's a string, return as is
    return question.question || '';
  }

  async goToQuestion(questonId, pageIndex, sectionIndex) {
    // Close modal first
    this.closeModal();
    
    // Wait for modal to close and DOM to update
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Mark the form control as touched to show validation errors
    const control = this.questionnaireForm?.controls[questonId];
    if (control) {
      control.markAsTouched();
      control.markAsDirty();
    }
    
    // Check if pagination is enabled
    const enablePagination = this.apiConfig?.enablePagination !== false;
    
    // Switch to the correct tab section first
    if (sectionIndex !== this.sectionIndex) {
      await this.setSection(sectionIndex, true);
      // Wait for tab to switch and component to be ready
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    const mainComponent = this.sectionTabs?.getCurrentMainComponent();
    if (mainComponent) {
      if (enablePagination) {
        // Paginated mode: Use page navigation
        mainComponent.pageIndex = pageIndex;
        mainComponent.handlePageEvent({
          pageIndex: pageIndex,
          questonId: questonId,
        });
        // Wait for page to load
        await new Promise(resolve => setTimeout(resolve, 400));
      } else {
        // Non-paginated mode: Scroll directly to the question element
        // Wait for DOM to be ready and Angular change detection to complete
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    // Use multiple attempts to find and focus the field
    const focusField = () => {
      // Try multiple ways to find the input element
      let inputElement: HTMLElement | null = null;
      
      // Method 1: Direct ID match
      inputElement = document.getElementById(questonId) as HTMLElement;
      
      // Method 2: Query selector for common input types
      if (!inputElement) {
        inputElement = document.querySelector(`input[id="${questonId}"], textarea[id="${questonId}"], mat-select[id="${questonId}"]`) as HTMLElement;
      }
      
      // Method 3: Find by name attribute
      if (!inputElement) {
        inputElement = document.querySelector(`input[name="${questonId}"], textarea[name="${questonId}"]`) as HTMLElement;
      }
      
      // Method 4: Find within question container
      if (!inputElement) {
        const questionContainer = document.querySelector(`[id*="${questonId}"]`);
        if (questionContainer) {
          inputElement = questionContainer.querySelector('input, textarea, mat-select, mat-radio-group, mat-checkbox') as HTMLElement;
        }
      }
      
      // Method 5: Find by form control name
      if (!inputElement && control) {
        const formElement = document.querySelector(`[formcontrolname="${questonId}"]`) as HTMLElement;
        if (formElement) {
          inputElement = formElement.querySelector('input, textarea, mat-select') as HTMLElement || formElement;
        }
      }
      
      // Method 6: Find the question container and scroll to it, then find input
      if (!inputElement) {
        const questionContainer = document.querySelector(`[id="${questonId}"], [data-question-id="${questonId}"]`) as HTMLElement;
        if (questionContainer) {
          questionContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
          inputElement = questionContainer.querySelector('input, textarea, mat-select, mat-radio-group, mat-checkbox') as HTMLElement;
        }
      }
      
      if (inputElement) {
        // Scroll to the element first
        inputElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Highlight the question container briefly
        const container = inputElement.closest('.responsive-margin, [class*="question"], [class*="field"]') || inputElement.parentElement;
        if (container) {
          const originalBoxShadow = (container as HTMLElement).style.boxShadow;
          const originalTransition = (container as HTMLElement).style.transition;
          (container as HTMLElement).style.transition = 'box-shadow 0.3s';
          (container as HTMLElement).style.boxShadow = '0 0 15px rgba(163, 0, 0, 0.6)';
          
          setTimeout(() => {
            (container as HTMLElement).style.boxShadow = originalBoxShadow;
            (container as HTMLElement).style.transition = originalTransition;
          }, 2000);
        }
        
        // Focus on the input element
        setTimeout(() => {
          if (inputElement) {
            if (inputElement.focus) {
              inputElement.focus();
            }
            // For mat-select, trigger click to open
            if (inputElement.tagName === 'MAT-SELECT' || inputElement.classList.contains('mat-select')) {
              (inputElement as any).click();
            }
          }
        }, 100);
        
        return true;
      }
      
      return false;
    };
    
    // Try focusing immediately
    if (!focusField()) {
      // If not found, wait a bit more and try again
      setTimeout(() => {
        if (!focusField()) {
          console.warn(`Question element with ID "${questonId}" not found for focusing`);
        }
      }, 500);
    }
  }

  formIsNotDirty() {
    window.parent.postMessage({
      type: 'formDirty',
      isDirty: false
    }, '*');
  }

  async ngOnDestroy() {
    // if (this.questionnaireForm.dirty) {
    //   await this.submission('save');
    // }
      await this.submission('save');


    // this.toaster.clearToaster()
    // if (this.solutionType == 'observation' && this.questionnaireForm.dirty) {
    //   this.saveQuestioner = true;
    //   if (!this.assessment.assessment.evidences[0].isSubmitted) {
    //     await this.submission('draft');
    //   }

      this.subscription?.unsubscribe();
      this.sharedService.updateValue(false);
      // this.questionnaireForm.reset();
      if (document.getElementById('observation-ion-toolbar')) {
        document.getElementById('observation-ion-toolbar').style.display = 'block';
      }
    // }
  }

  async getQuestions(data) {
    if (data?.isATargetedSolution === false) {
      this.toaster.showToast('Dear User, this Observation is not relevant for your subrole and location', 'danger', 5000)
    }

    this.assessment = this.questionnaireService.mapSubmissionToAssessment(
      data
    );
    this.submissionId = this.assessment.assessment.submissionId;
    this.evidenceCode = this.assessment.assessment.evidences[this.sectionIndex].code;
    this.apiConfig.index = this.sectionIndex;
    let isDataInlocalSotrage = await this.checkAndMapIndexDbDataToVariables();
    if(this.submissionId){
      this.setDataInIndexDb(this.submissionId);
    }
    if (!isDataInlocalSotrage) {
      this.evidence = this.solutionType == 'observation' ? this.assessment?.assessment?.evidences[+[this.apiConfig.index]] : this.assessment?.assessment?.evidences[0];
      this.evidence.startTime = Date.now();
      this.endDate = new Date(
        new Date(this.assessment?.assessment?.endDate).getTime() +
        new Date(this.assessment?.assessment?.endDate).getTimezoneOffset() *
        60000
      );
      this.isExpired = this.assessment?.assessment?.status == 'expired';
      this.sections = this.evidence?.sections;
      
      // Apply default values after page loads, then set loaded = true
      await this.applyDefaultValuesAfterLoad();
    }
  }

  surveyExpired(data) {
    const message = { type: 'EXPIRED', data: data };
    this.sendMessage(message, '*');
  }

  calculatePageCompletion(submission: any) {
    if (!submission || !submission.answers || !this.sections) return;
  
    let totalPages = 0;
    let completedPages = 0;
    const answersObj = submission.answers;

    this.sections.forEach((section) => {
      section.questions.forEach((q:any) => {

        if (Array.isArray(q.visibleIf) && !q.canDisplay) {
          return;
        }

        if (q.responseType === 'pageQuestions') {
          totalPages++;
          const allAnswered = q.pageQuestions.every((pq:any) => {
            if (Array.isArray(pq.visibleIf) && !pq.canDisplay) {
              return true;
            }

            const ans = submission.answers[pq._id]?.value;
            const required = pq.validation?.required;
  
            if (required) {
              return Array.isArray(ans)
                ? ans.some(v => v !== '' && v != null)
                : ans !== undefined && ans !== null && ans.toString().trim() !== '';
            } else {
              return true;
            }
          });
  
          if (allAnswered) completedPages++;
        } else {
          totalPages++;
          const ans = submission.answers[q._id]?.value;
          const required = q.validation?.required;
  
          const isAnswered = required
            ? (Array.isArray(ans)
                ? ans.some(v => v !== '' && v != null)
                : ans !== undefined && ans !== null && ans.toString().trim() !== '')
            : true;
  
          if (isAnswered) completedPages++;
        }
      });
    });
  
    this.totalPages = totalPages;
    this.completedPages = completedPages;
    this.calculatePageProgressValue();
  }

  calculatePageProgressValue(){
    this.pageProgressValue = this.totalPages > 0
    ? Math.round((this.completedPages / this.totalPages) * 100)
    : 0;
    this.sendMessage({ type: 'PROGRESS', data: { percentage: this.pageProgressValue, completedPages: this.completedPages, totalPages: this.totalPages} });
  }

  calculateInitialProgress() {
    if (!this.sections || !this.questionnaireForm) {
      return;
    }

    // Check if form has any controls - if not, wait a bit more (only for initial load)
    const formControlKeys = Object.keys(this.questionnaireForm.controls);
    if (formControlKeys.length === 0 && !this.evidence) {
      // Form controls not ready yet, try again after a delay (only on initial load)
      setTimeout(() => {
        this.calculateInitialProgress();
      }, 300);
      return;
    }

    // Get progress calculation level from config (default: 'page')
    const progressLevel = this.apiConfig?.progressCalculationLevel || 'page';
    
    if (progressLevel === 'input') {
      // Input level calculation - counts each individual input/field
      this.calculateInputLevelProgress();
    } else {
      // Page level calculation - counts completed pages
      if (this.evidence) {
        const evidenceData = this.questionnaireService.getEvidenceData(
          this.evidence,
          this.questionnaireForm.value
        );
        if (evidenceData?.answers) {
          const submission = {
            answers: evidenceData.answers
          };
          this.calculatePageCompletion(submission);
        } else {
          // If no answers yet, initialize with 0 progress
          this.totalPages = 0;
          this.completedPages = 0;
          this.calculatePageProgressValue();
        }
      } else {
        // If evidence not available yet, initialize with 0 progress
        this.totalPages = 0;
        this.completedPages = 0;
        this.calculatePageProgressValue();
      }
    }
  }

  calculateInputLevelProgress() {
    if (!this.sections || !this.questionnaireForm) return;

    let totalInputs = 0;
    let completedInputs = 0;
    const countOptionalFields = this.apiConfig?.progressCountOptionalFields !== false; // Default: true (count optional fields)

    this.sections.forEach((section) => {
      section.questions.forEach((q: any) => {
        // Check if question is visible
        const isVisible = (Array.isArray(q.visibleIf) && q.canDisplay) || !Array.isArray(q.visibleIf);
        if (!isVisible) return;

        if (q.responseType === 'pageQuestions') {
          // For pageQuestions, count each pageQuestion as a separate input
          q.pageQuestions.forEach((pq: any) => {
            const pqIsVisible = (Array.isArray(pq.visibleIf) && pq.canDisplay) || !Array.isArray(pq.visibleIf);
            if (!pqIsVisible) return;

            const control = this.questionnaireForm.controls[pq._id];
            if (!control) return; // Skip if control doesn't exist

            const validation = pq.validation;
            const isRequired = typeof validation !== 'string' && validation?.required;
            const value = control.value;

            // Count field if: required OR (optional AND countOptionalFields is true)
            const countThisField = isRequired || countOptionalFields;
            
            if (countThisField) {
              totalInputs++;
              
            // Check if field is completed
            const isEmpty = Array.isArray(value)
              ? !value.some(v => v !== '' && v != null && v !== undefined)
              : (value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === ''));

            // Field is completed if:
            // - Required: must not be empty and must be valid
            // - Optional: always considered completed (empty is acceptable)
            const isCompleted = isRequired 
              ? (!isEmpty && control?.valid)
              : true; // Optional fields are always "completed" for progress

            if (isCompleted) {
              completedInputs++;
            }
            }
          });
        } else {
          // Regular question - count as one input
          const control = this.questionnaireForm.controls[q._id];
          if (!control) return; // Skip if control doesn't exist

          const validation = q.validation;
          const isRequired = typeof validation !== 'string' && validation?.required;
          const value = control.value;

          // Count field if: required OR (optional AND countOptionalFields is true)
          const countThisField = isRequired || countOptionalFields;
          
          if (countThisField) {
            totalInputs++;
            
            // Check if field is completed
            const isEmpty = Array.isArray(value)
              ? !value.some(v => v !== '' && v != null && v !== undefined)
              : (value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === ''));

            // Field is completed if:
            // - Required: must not be empty and must be valid
            // - Optional: always considered completed (empty is acceptable)
            const isCompleted = isRequired 
              ? (!isEmpty && control?.valid)
              : true; // Optional fields are always "completed" for progress

            if (isCompleted) {
              completedInputs++;
            }
          }
        }
      });
    });

    // Update progress values (using same variables for compatibility)
    this.totalPages = totalInputs;
    this.completedPages = completedInputs;
    this.calculatePageProgressValue();
  }

  async startQuestioner() {
    const { observationAsTask, isATargetedSolution } = this.stateData || {};
    if(this.questionNotStarted && this.stateData?.isSurvey){
      this.questionNotStarted = false;
      this.evidence.progressStatus = "inProgress";
      await this.submission('save');
      return
    } 

    if (observationAsTask || isATargetedSolution) {
      const message = { type: 'START', data: this.stateData };
      this.sendMessage(message, '*');
    } 
    else {
      this.toaster.showToast(
        'Dear User, this Observation is not relevant for your subrole and location',
        'danger',
        5000
      );
    }
  }
  
  enableDisableStartBtn(evidence){
    if (!evidence) return;

    if(evidence?.isSubmitted){
      this.questionNotStarted = false;
    }else if(this.solutionType === "survey"){
      this.questionNotStarted = false;
    }else if(!evidence?.isSubmitted && (!evidence?.progressStatus || evidence?.progressStatus == 'notStarted')){
      this.questionNotStarted = true;
    }else{
      this.questionNotStarted = false;
    }
    this.initialized = true;
  }

  async loadInitialData() {
    try {
      await this.checkAndMapIndexDbDataToVariables();
    } finally {
      this.loaded = false; // Only hide after state mapping done
    }

}
}

